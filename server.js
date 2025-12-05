const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const https = require('https');
const path = require('path');
const { getConfig } = require('./config');
const db = require('./database');
const { getCertificates } = require('./cert-utils');

// Initialize database
let databaseReady = false;

// Dynamic base URL - updated from requests
let dynamicBaseUrl = null;

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
    // Fallback to localhost
    const port = config.server.port || 7003;
    return `https://localhost:${port}`;
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

// Start server
async function startServer() {
    const config = getConfig();
    
    // Initialize database
    try {
        await db.initDatabase();
        databaseReady = true;
        console.log('✅ Database initialized');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
    
    // Check configuration
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        console.log('⚠️  Real Debrid not configured');
    }
    
    if (!config.reddit.clientId || !config.reddit.clientSecret || 
        !config.reddit.username || !config.reddit.password) {
        console.log('⚠️  Reddit API not configured');
    }
    
    const port = config.server.port || 7003;
    const app = express();
    
    // Dynamic base URL detection from requests
    app.use((req, _res, next) => {
        try {
            const proto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || 'https';
            const host = req.headers.host;
            if (host) {
                // Update dynamic base URL based on the request
                // This ensures images use the correct host (IP or localhost)
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
    
    // Get SSL certificates for HTTPS (required)
    let sslOptions;
    try {
        sslOptions = await getCertificates();
    } catch (error) {
        console.error('❌ Failed to load SSL certificates:', error.message);
        console.error('   HTTPS is required for Stremio addons. Exiting...');
        process.exit(1);
    }
    
    // Start HTTPS server
    const httpsServer = https.createServer(sslOptions, app);
    httpsServer.listen(port, '0.0.0.0', () => {
        console.log(`\n🚀 Stremula 1 Addon server running on HTTPS port ${port}`);
        
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
                console.log(`   https://${ip}:${port}/manifest.json`);
            });
        } else {
            console.log(`📡 Install in Stremio: https://YOUR_IP:${port}/manifest.json`);
            console.log(`   (Replace YOUR_IP with your MacBook's IP address)`);
        }
        console.log(`📡 Install in Stremio (localhost): https://localhost:${port}/manifest.json`);
        console.log(`📊 Database ready: ${databaseReady}`);
        console.log(`\n⚠️  Note: Self-signed certificate will show a security warning`);
        console.log(`   This is normal for local development. You can safely proceed.`);
    });
    
    // Handle server errors
    httpsServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`\n❌ Port ${port} is already in use.`);
            console.error(`   Please stop the other process or use a different port.`);
            console.error(`   To find and kill the process: kill -9 $(lsof -ti:${port})`);
        } else {
            console.error('❌ HTTPS server error:', error);
        }
        process.exit(1);
    });
}

if (require.main === module) {
    startServer().catch(console.error);
}

module.exports = { startServer };

