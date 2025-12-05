const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { getConfig } = require('./config');
const db = require('./database');
const { getCertificates } = require('./cert-utils');
// Auto-updater is now handled by fetcher-service after each fetch completes

// Initialize database
let databaseReady = false;

// Dynamic base URL - updated from requests
let dynamicBaseUrl = null;

// Auto-restart configuration
const RESTART_CONFIG = {
    maxRestarts: 5, // Maximum restart attempts
    restartWindowMs: 60000, // 1 minute window
    restartDelayMs: 5000, // 5 second delay before restart
};

// Track restart attempts
let restartAttempts = [];
let isRestarting = false;
let httpServerInstance = null;
let httpsServerInstance = null;
let errorHandlersSetup = false;

// Helper function to convert slug to GP name
function slugToGpName(slug) {
    // Map of known GP slugs to their proper names
    const gpNameMap = {
        'bahrain-grand-prix': 'Bahrain Grand Prix',
        'saudi-arabian-grand-prix': 'Saudi Arabian Grand Prix',
        'australian-grand-prix': 'Australian Grand Prix',
        'japanese-grand-prix': 'Japanese Grand Prix',
        'chinese-grand-prix': 'Chinese Grand Prix',
        'miami-grand-prix': 'Miami Grand Prix',
        'emilia-romagna-grand-prix': 'Emilia Romagna Grand Prix',
        'monaco-grand-prix': 'Monaco Grand Prix',
        'spanish-grand-prix': 'Spanish Grand Prix',
        'canadian-grand-prix': 'Canadian Grand Prix',
        'austrian-grand-prix': 'Austrian Grand Prix',
        'british-grand-prix': 'British Grand Prix',
        'hungarian-grand-prix': 'Hungarian Grand Prix',
        'belgian-grand-prix': 'Belgian Grand Prix',
        'dutch-grand-prix': 'Dutch Grand Prix',
        'italian-grand-prix': 'Italian Grand Prix',
        'azerbaijan-grand-prix': 'Azerbaijan Grand Prix',
        'singapore-grand-prix': 'Singapore Grand Prix',
        'united-states-grand-prix': 'United States Grand Prix',
        'mexican-grand-prix': 'Mexican Grand Prix',
        'brazilian-grand-prix': 'Brazilian Grand Prix',
        'las-vegas-grand-prix': 'Las Vegas Grand Prix',
        'qatar-grand-prix': 'Qatar Grand Prix',
        'abu-dhabi-grand-prix': 'Abu Dhabi Grand Prix'
    };
    
    if (gpNameMap[slug]) {
        return gpNameMap[slug];
    }
    
    // Fallback: convert slug to name
    return slug.split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Poster mapping
const posterMap = {
    'Bahrain Grand Prix': 'bahrain.webp',
    'Saudi Arabian Grand Prix': 'jeddah.webp',
    'Australian Grand Prix': 'australian.webp',
    'Japanese Grand Prix': 'japanese.webp',
    'Chinese Grand Prix': 'chinese.webp',
    'Miami Grand Prix': 'miami.webp',
    'Emilia Romagna Grand Prix': 'italian-imola.webp',
    'Monaco Grand Prix': 'monaco.webp',
    'Spanish Grand Prix': 'spanish.webp',
    'Canadian Grand Prix': 'canadian.webp',
    'Austrian Grand Prix': 'austrian.webp',
    'British Grand Prix': 'british.webp',
    'Hungarian Grand Prix': 'hungarian.webp',
    'Belgian Grand Prix': 'belgian.webp',
    'Dutch Grand Prix': 'dutch.webp',
    'Italian Grand Prix': 'italian-monza.webp',
    'Azerbaijan Grand Prix': 'azerbaijan.webp',
    'Singapore Grand Prix': 'singapore.webp',
    'United States Grand Prix': 'united states-austin.webp',
    'Mexican Grand Prix': 'mexico.webp',
    'Brazilian Grand Prix': 'brasil.webp',
    'Las Vegas Grand Prix': 'las vegas.webp',
    'Qatar Grand Prix': 'qatar.webp',
    'Abu Dhabi Grand Prix': 'abu dhabi.webp'
};

// Thumbnail mapping
function getThumbnailForSession(sessionType) {
    const sessionTypeLower = sessionType.toLowerCase();
    
    if (sessionTypeLower.includes('practice 1') || sessionTypeLower.includes('free practice one') || sessionTypeLower.includes('fp1')) {
        return `${getPublicBaseUrl()}/media/practice 1.png`;
    }
    if (sessionTypeLower.includes('practice 2') || sessionTypeLower.includes('free practice two') || sessionTypeLower.includes('fp2')) {
        return `${getPublicBaseUrl()}/media/practice 2.png`;
    }
    if (sessionTypeLower.includes('practice 3') || sessionTypeLower.includes('free practice three') || sessionTypeLower.includes('fp3')) {
        return `${getPublicBaseUrl()}/media/practice 3.png`;
    }
    if (sessionTypeLower.includes('sprint qualifying')) {
        return `${getPublicBaseUrl()}/media/sprint qualifying.png`;
    }
    if (sessionTypeLower.includes('sprint') && !sessionTypeLower.includes('qualifying')) {
        return `${getPublicBaseUrl()}/media/sprint.png`;
    }
    if (sessionTypeLower.includes('qualifying') || sessionTypeLower.includes('quali')) {
        return `${getPublicBaseUrl()}/media/qualifying.png`;
    }
    if (sessionTypeLower.includes('race')) {
        return `${getPublicBaseUrl()}/media/race.png`;
    }
    return `${getPublicBaseUrl()}/media/practice 1.png`;
}

function getPosterForGrandPrix(gpName) {
    const posterFile = posterMap[gpName];
    if (posterFile) {
        return `${getPublicBaseUrl()}/media/${posterFile}`;
    }
    return `${getPublicBaseUrl()}/media/background.jpeg`;
}

// Helper to check if host is localhost
function isLocalhost(host) {
    if (!host) return true;
    const hostname = host.split(':')[0];
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function getPublicBaseUrl() {
    const config = getConfig();
    // Use configured base URL if set
    if (config.server.publicBaseUrl) {
        return config.server.publicBaseUrl;
    }
    // Use dynamically detected base URL from requests
    if (dynamicBaseUrl) {
        return dynamicBaseUrl;
    }
    // Fallback to localhost (HTTP for localhost)
    const httpPort = config.server.port || 7003;
    return `http://localhost:${httpPort}`;
}

// Addon Manifest
const manifest = {
    id: 'org.stremio.stremula1',
    version: '3.0.0',
    name: 'Stremula 1',
    description: 'High-quality Sky Sports F1 replays with Real Debrid integration',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/0/06/F1_tire_Pirelli_PZero_Pink.svg',
    background: '',
    types: ['series'],
    catalogs: [
        {
            type: 'series',
            id: 'stremula1-2025',
            name: 'F1',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'genre', options: ['Race', 'Qualifying', 'Practice', 'Sprint', 'Sprint Qualifying'], isRequired: false }
            ]
        }
    ],
    resources: ['catalog', 'meta', 'stream'],
    idPrefixes: ['stremula1']
};

const builder = new addonBuilder(manifest);

// Catalog Handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    if (type !== 'series' || id !== 'stremula1-2025') {
        return Promise.resolve({ metas: [] });
    }
    
    const config = getConfig();
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        return Promise.resolve({ metas: [] });
    }
    
    try {
        const weekends = await db.getAllWeekends();
        const metas = [];
        
        // Sort by round (newest first) and limit to last 10
        const sortedWeekends = weekends
            .sort((a, b) => b.grand_prix_round - a.grand_prix_round)
            .slice(0, 10);
        
        for (const weekend of sortedWeekends) {
            metas.push({
                id: `stremula1:${weekend.grand_prix_name.replace(/\s+/g, '-').toLowerCase()}`,
                type: 'series',
                name: weekend.grand_prix_name,
                poster: getPosterForGrandPrix(weekend.grand_prix_name),
                background: `${getPublicBaseUrl()}/media/background.jpeg`,
                logo: `${getPublicBaseUrl()}/media/logo.webp`,
                description: `Sky Sports F1 presents the ${weekend.grand_prix_name}, with Martin Brundle and David Croft analysing the action`,
                releaseInfo: `Round ${weekend.grand_prix_round} • ${weekend.country}`,
                genres: ['Formula 1', 'Motorsport', 'Racing', 'Real-Debrid'],
                extra: {
                    search: extra?.search || '',
                    genre: extra?.genre || ''
                }
            });
        }
        
        return Promise.resolve({ metas });
    } catch (error) {
        console.error('Error in catalog handler:', error);
        return Promise.resolve({ metas: [] });
    }
});

// Meta Handler
builder.defineMetaHandler(async ({ type, id }) => {
    if (type !== 'series' || !id.startsWith('stremula1:')) {
        return Promise.resolve({ meta: null });
    }
    
    const config = getConfig();
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        return Promise.resolve({ meta: null });
    }
    
    try {
        const parts = id.split(':');
        if (parts.length < 2) {
            return Promise.resolve({ meta: null });
        }
        
        const gpNameSlug = parts[1];
        const gpName = slugToGpName(gpNameSlug);
        const weekendData = await db.getWeekendWithSessions(gpName);
        
        if (!weekendData || !weekendData.sessions) {
            return Promise.resolve({ meta: null });
        }
        
        const sessionOrder = [
            'Free Practice One',
            'Free Practice Two', 
            'Free Practice Three',
            'Sprint Qualifying',
            'Sprint',
            'Qualifying',
            'Race'
        ];
        
        const videos = [];
        let episodeNumber = 1;
        
        // Add sessions in order
        for (const sessionType of sessionOrder) {
            const session = weekendData.sessions.find(s => {
                const sessionNameLower = s.session_name.toLowerCase();
                const sessionTypeLower = sessionType.toLowerCase();
                
                if (sessionTypeLower.includes('practice one') && 
                    (sessionNameLower.includes('practice one') || sessionNameLower.includes('practice.one') || sessionNameLower.includes('fp1'))) {
                    return true;
                } else if (sessionTypeLower.includes('practice two') && 
                    (sessionNameLower.includes('practice two') || sessionNameLower.includes('practice.two') || sessionNameLower.includes('fp2'))) {
                    return true;
                } else if (sessionTypeLower.includes('practice three') && 
                    (sessionNameLower.includes('practice three') || sessionNameLower.includes('practice.three') || sessionNameLower.includes('fp3'))) {
                    return true;
                } else if (sessionTypeLower.includes('sprint qualifying') && 
                    (sessionNameLower.includes('sprint qualifying') || sessionNameLower.includes('sprint quali'))) {
                    return true;
                } else if (sessionTypeLower === 'sprint' && 
                    sessionNameLower.includes('sprint') && 
                    !sessionNameLower.includes('qualifying') && 
                    !sessionNameLower.includes('race')) {
                    return true;
                } else if (sessionTypeLower === 'qualifying' && 
                    (sessionNameLower.includes('qualifying') || sessionNameLower.includes('quali')) && 
                    !sessionNameLower.includes('sprint')) {
                    return true;
                } else if (sessionTypeLower === 'race' && 
                    sessionNameLower.includes('race') && 
                    !sessionNameLower.includes('sprint')) {
                    return true;
                }
                return false;
            });
            
            if (session && session.streams && session.streams.length > 0) {
                const sessionDate = session.session_date ? 
                    new Date(session.session_date.split('.').reverse().join('-')).toISOString() : 
                    new Date(session.updated_at).toISOString();
                
                videos.push({
                    id: `stremula1:${gpNameSlug}:${sessionType}`,
                    title: session.session_display_name || session.session_name,
                    season: 1,
                    episode: episodeNumber++,
                    released: sessionDate,
                    thumbnail: getThumbnailForSession(sessionType),
                    overview: `Sky Sports F1 presents the ${weekendData.grand_prix_name}: ${session.session_display_name || session.session_name}, with Martin Brundle and David Croft analysing the action`
                });
            }
        }
        
        const meta = {
            id: id,
            type: 'series',
            name: weekendData.grand_prix_name,
            poster: getPosterForGrandPrix(weekendData.grand_prix_name),
            background: `${getPublicBaseUrl()}/media/background.jpeg`,
            logo: `${getPublicBaseUrl()}/media/logo.webp`,
            description: `Sky Sports F1 presents the ${weekendData.grand_prix_name}, with Martin Brundle and David Croft analysing the action`,
            releaseInfo: `Round ${weekendData.grand_prix_round} • ${weekendData.country}`,
            genres: ['Formula 1', 'Motorsport', 'Racing'],
            videos: videos
        };
        
        return Promise.resolve({ meta });
    } catch (error) {
        console.error('Error in meta handler:', error);
        return Promise.resolve({ meta: null });
    }
});

// Stream Handler
builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== 'series' || !id.startsWith('stremula1:')) {
        return Promise.resolve({ streams: [] });
    }
    
    const config = getConfig();
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        return Promise.resolve({ streams: [] });
    }
    
    try {
        const parts = id.split(':');
        if (parts.length < 3) {
            return Promise.resolve({ streams: [] });
        }
        
        const gpNameSlug = parts[1];
        const sessionType = parts[2];
        const gpName = slugToGpName(gpNameSlug);
        const weekendData = await db.getWeekendWithSessions(gpName);
        
        if (!weekendData || !weekendData.sessions) {
            return Promise.resolve({ streams: [] });
        }
        
        // Find matching session
        const session = weekendData.sessions.find(s => {
            const sessionNameLower = s.session_name.toLowerCase();
            const sessionTypeLower = sessionType.toLowerCase();
            
            if (sessionTypeLower.includes('practice one') && 
                (sessionNameLower.includes('practice one') || sessionNameLower.includes('practice.one') || sessionNameLower.includes('fp1'))) {
                return true;
            } else if (sessionTypeLower.includes('practice two') && 
                (sessionNameLower.includes('practice two') || sessionNameLower.includes('practice.two') || sessionNameLower.includes('fp2'))) {
                return true;
            } else if (sessionTypeLower.includes('practice three') && 
                (sessionNameLower.includes('practice three') || sessionNameLower.includes('practice.three') || sessionNameLower.includes('fp3'))) {
                return true;
            } else if (sessionTypeLower.includes('sprint qualifying') && 
                (sessionNameLower.includes('sprint qualifying') || sessionNameLower.includes('sprint quali'))) {
                return true;
            } else if (sessionTypeLower === 'sprint' && 
                sessionNameLower.includes('sprint') && 
                !sessionNameLower.includes('qualifying') && 
                !sessionNameLower.includes('race')) {
                return true;
            } else if (sessionTypeLower === 'qualifying' && 
                (sessionNameLower.includes('qualifying') || sessionNameLower.includes('quali')) && 
                !sessionNameLower.includes('sprint')) {
                return true;
            } else if (sessionTypeLower === 'race' && 
                sessionNameLower.includes('race') && 
                !sessionNameLower.includes('sprint')) {
                return true;
            }
            return false;
        });
        
        if (!session || !session.streams || session.streams.length === 0) {
            return Promise.resolve({ streams: [] });
        }
        
        const streams = [];
        for (const stream of session.streams) {
            streams.push({
                title: `${session.session_display_name || session.session_name} - ${stream.quality}`,
                url: stream.url,
                filename: stream.filename,
                behaviorHints: {
                    bingeGroup: `stremula1-${weekendData.grand_prix_round}-${sessionType}`,
                    notWebReady: false
                }
            });
        }
        
        return Promise.resolve({ streams });
    } catch (error) {
        console.error('Error in stream handler:', error);
        return Promise.resolve({ streams: [] });
    }
});

// Setup global error handlers for auto-restart
function setupGlobalErrorHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
        console.error('Stack:', error.stack);
        handleCriticalError('uncaughtException', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Promise Rejection:', reason);
        if (reason instanceof Error) {
            console.error('Stack:', reason.stack);
        }
        handleCriticalError('unhandledRejection', reason);
    });
}

// Handle critical errors with auto-restart
function handleCriticalError(type, error) {
    if (isRestarting) {
        console.error('⚠️  Already restarting, exiting...');
        process.exit(1);
        return;
    }

    // Filter restart attempts within the window
    const now = Date.now();
    restartAttempts = restartAttempts.filter(timestamp => now - timestamp < RESTART_CONFIG.restartWindowMs);

    // Check if we've exceeded max restarts
    if (restartAttempts.length >= RESTART_CONFIG.maxRestarts) {
        console.error(`❌ Maximum restart attempts (${RESTART_CONFIG.maxRestarts}) exceeded within ${RESTART_CONFIG.restartWindowMs}ms`);
        console.error('   This indicates a persistent error. Please check logs and fix the issue.');
        process.exit(1);
        return;
    }

    // Add this restart attempt
    restartAttempts.push(now);
    
    console.error(`\n⚠️  Critical error detected (${type}). Attempting to restart...`);
    console.error(`   Restart attempt ${restartAttempts.length}/${RESTART_CONFIG.maxRestarts}`);
    
    // Gracefully shutdown servers
    shutdownServers(() => {
        console.log(`⏳ Waiting ${RESTART_CONFIG.restartDelayMs}ms before restart...`);
        setTimeout(() => {
            restartServer();
        }, RESTART_CONFIG.restartDelayMs);
    });
}

// Gracefully shutdown servers
function shutdownServers(callback) {
    isRestarting = true;
    let shutdownCount = 0;
    const totalServers = (httpServerInstance ? 1 : 0) + (httpsServerInstance ? 1 : 0);

    if (totalServers === 0) {
        // Give a small delay to ensure any pending operations complete
        setTimeout(callback, 500);
        return;
    }

    const checkShutdown = () => {
        shutdownCount++;
        if (shutdownCount >= totalServers) {
            // Additional delay to ensure port is fully released
            console.log('⏳ Waiting for port to be released...');
            setTimeout(callback, 1000);
        }
    };

    if (httpServerInstance) {
        // Stop accepting new connections
        httpServerInstance.close(() => {
            console.log('✅ HTTP server closed');
            httpServerInstance = null;
            checkShutdown();
        });
        
        // Also close all existing connections
        httpServerInstance.closeAllConnections && httpServerInstance.closeAllConnections();
    } else {
        checkShutdown();
    }

    if (httpsServerInstance) {
        // Stop accepting new connections
        httpsServerInstance.close(() => {
            console.log('✅ HTTPS server closed');
            httpsServerInstance = null;
            checkShutdown();
        });
        
        // Also close all existing connections
        httpsServerInstance.closeAllConnections && httpsServerInstance.closeAllConnections();
    } else {
        checkShutdown();
    }

    // Force close after timeout
    setTimeout(() => {
        if (httpServerInstance) {
            httpServerInstance.close();
            httpServerInstance.closeAllConnections && httpServerInstance.closeAllConnections();
            httpServerInstance = null;
        }
        if (httpsServerInstance) {
            httpsServerInstance.close();
            httpsServerInstance.closeAllConnections && httpsServerInstance.closeAllConnections();
            httpsServerInstance = null;
        }
        callback();
    }, 10000);
}

// Restart the server process
function restartServer() {
    console.log('🔄 Restarting server...');
    isRestarting = true;

    // Use child_process to spawn a new instance
    const args = process.argv.slice(1);
    const child = spawn(process.execPath, args, {
        stdio: 'inherit',
        detached: false
    });

    child.on('error', (error) => {
        console.error('❌ Failed to restart server:', error);
        process.exit(1);
    });

    child.on('exit', (code) => {
        if (code !== 0) {
            console.error(`❌ Server restart process exited with code ${code}`);
            process.exit(code);
        }
    });

    // Exit current process after spawning new one
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

// Start server
async function startServer() {
    // Reset restart flag
    isRestarting = false;

    // Setup global error handlers on first run
    if (!errorHandlersSetup) {
        setupGlobalErrorHandlers();
        errorHandlersSetup = true;
    }

    const config = getConfig();
    
    // Initialize database
    try {
        await db.initDatabase();
        databaseReady = true;
        console.log('✅ Database initialized');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        handleCriticalError('databaseInit', error);
        return;
    }
    
    // Check configuration
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        console.log('⚠️  Real Debrid not configured');
    }
    
    if (!config.reddit.clientId || !config.reddit.clientSecret || 
        !config.reddit.username || !config.reddit.password) {
        console.log('⚠️  Reddit API not configured');
    }
    
    const httpPort = config.server.port || 7003;
    const httpsPort = httpPort + 1; // HTTPS on next port
    const app = express();
    
    // Dynamic base URL detection from requests
    app.use((req, _res, next) => {
        try {
            const host = req.headers.host;
            if (host) {
                // Determine protocol based on host
                // localhost uses HTTP, IP addresses use HTTPS
                const isLocal = isLocalhost(host);
                const proto = isLocal ? 'http' : (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || 'https';
                // Update dynamic base URL based on the request
                // This ensures images use the correct host and protocol
                dynamicBaseUrl = `${proto}://${host}`;
            }
        } catch (_e) {}
        next();
    });
    
    // Serve static files (media folder)
    app.use('/media', express.static(path.join(__dirname, 'media')));
    
    // Mount Stremio addon router
    const router = getRouter({ manifest, get: builder.getInterface().get });
    app.use('/', router);
    
    // Get SSL certificates for HTTPS (required for IP access)
    let sslOptions;
    try {
        sslOptions = await getCertificates();
    } catch (error) {
        console.error('⚠️  Failed to load SSL certificates:', error.message);
        console.error('   HTTPS will not be available. Only localhost HTTP will work.');
        sslOptions = null;
    }
    
    // Start HTTP server for localhost (Stremio allows HTTP for 127.0.0.1)
    httpServerInstance = http.createServer(app);
    
    // Add error handler to prevent crashes from propagating
    httpServerInstance.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`\n❌ Port ${httpPort} is already in use.`);
            console.error(`   Please stop the other process or use a different port.`);
            console.error(`   To find and kill the process: kill -9 $(lsof -ti:${httpPort})`);
            // Don't restart for port conflicts - this is a configuration issue
            process.exit(1);
        } else {
            console.error('❌ HTTP server error:', error);
            handleCriticalError('httpServerError', error);
        }
    });

    // Handle client errors gracefully
    httpServerInstance.on('clientError', (err, socket) => {
        console.error('⚠️  HTTP client error:', err.message);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });

    try {
        httpServerInstance.listen(httpPort, '127.0.0.1', () => {
            console.log(`\n🌐 HTTP server running on port ${httpPort} (localhost only)`);
            console.log(`📡 Install in Stremio (localhost): http://localhost:${httpPort}/manifest.json`);
            console.log(`📡 Install in Stremio (localhost): http://127.0.0.1:${httpPort}/manifest.json`);
        });
    } catch (error) {
        console.error('❌ Failed to start HTTP server:', error);
        handleCriticalError('httpServerStart', error);
        return;
    }
    
    // Start HTTPS server for IP access on different port (if certificates available)
    if (sslOptions) {
        httpsServerInstance = https.createServer(sslOptions, app);
        
        // Handle HTTPS server errors
        httpsServerInstance.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`\n❌ Port ${httpsPort} is already in use.`);
                console.error(`   Please stop the other process or use a different port.`);
                console.error(`   To find and kill the process: kill -9 $(lsof -ti:${httpsPort})`);
                // Don't restart for port conflicts
            } else {
                console.error('❌ HTTPS server error:', error);
                // Don't restart for HTTPS errors if HTTP is still running
                console.error('⚠️  HTTP server continues running for localhost access');
            }
        });

        // Handle client errors gracefully
        // Track error frequency to avoid spam
        const clientErrorCounts = new Map();
        const ERROR_LOG_INTERVAL = 60000; // 1 minute
        
        httpsServerInstance.on('clientError', (err, socket) => {
            const errorMsg = err.message || '';
            
            // Filter out expected SSL certificate errors (self-signed cert rejections)
            // These are normal when clients don't trust the self-signed certificate
            if (errorMsg.includes('certificate unknown') || 
                errorMsg.includes('sslv3 alert certificate unknown') ||
                errorMsg.includes('SSL alert number 46')) {
                // Suppress these expected errors - they're normal for self-signed certs
                socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                return;
            }
            
            // For other errors, rate limit logging to avoid spam
            const errorKey = errorMsg.substring(0, 100); // Use first 100 chars as key
            const now = Date.now();
            const errorInfo = clientErrorCounts.get(errorKey);
            
            if (!errorInfo || (now - errorInfo.lastLogged) > ERROR_LOG_INTERVAL) {
                const count = errorInfo ? errorInfo.count + 1 : 1;
                clientErrorCounts.set(errorKey, { count, lastLogged: now });
                
                if (count === 1) {
                    console.error('⚠️  HTTPS client error:', errorMsg);
                } else {
                    console.error(`⚠️  HTTPS client error (${count} times in last minute):`, errorMsg);
                }
            } else {
                errorInfo.count++;
            }
            
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });

        try {
            httpsServerInstance.listen(httpsPort, '0.0.0.0', () => {
                console.log(`\n🔒 HTTPS server running on port ${httpsPort} (for IP access)`);
                
                // Get local IP addresses for display
                const os = require('os');
                const interfaces = os.networkInterfaces();
                const ips = [];
                for (const name of Object.keys(interfaces)) {
                    for (const iface of interfaces[name]) {
                        if (iface.family === 'IPv4' && !iface.internal) {
                            ips.push(iface.address);
                        }
                    }
                }
                
                if (ips.length > 0) {
                    console.log(`📡 Install in Stremio (via IP):`);
                    ips.forEach(ip => {
                        console.log(`   https://${ip}:${httpsPort}/manifest.json`);
                    });
                } else {
                    console.log(`📡 Install in Stremio: https://YOUR_IP:${httpsPort}/manifest.json`);
                    console.log(`   (Replace YOUR_IP with your device's IP address)`);
                }
                console.log(`\n⚠️  Note: Self-signed certificate will show a security warning`);
                console.log(`   This is normal for local development. You can safely proceed.`);
            });
        } catch (error) {
            console.error('❌ Failed to start HTTPS server:', error);
            console.error('⚠️  HTTP server continues running for localhost access');
        }
    }
    
    console.log(`📊 Database ready: ${databaseReady}`);
    console.log(`🔄 Auto-restart enabled (max ${RESTART_CONFIG.maxRestarts} restarts per ${RESTART_CONFIG.restartWindowMs/1000}s)`);
    
    // Note: Auto-updater is now handled by fetcher-service after each fetch completes
    // This prevents conflicts and ensures updates only happen when fetcher is idle
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error('❌ Failed to start server:', error);
        handleCriticalError('startup', error);
    });
}

module.exports = { startServer };

