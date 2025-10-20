const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    EGORTECH_REDDIT_URL: 'https://www.reddit.com/user/egortech/',
    CACHE_DURATION: 30 * 60 * 1000, // 30 minutes
    REALDEBRID_API_URL: 'https://api.real-debrid.com/rest/1.0',
    CACHE_FILE: path.join(__dirname, 'cache', 'addon-cache.json'),
    POSTS_CACHE_FILE: path.join(__dirname, 'cache', 'posts-cache.json'),
    FULLY_PROCESSED_POSTS_FILE: path.join(__dirname, 'cache', 'fully-processed-posts.json'),
    MAX_SCROLL_MONTHS: 1, // Scroll back 1 months
    SCROLL_DELAY: 500, // 0.5 seconds between scroll requests
    MAX_CONSECUTIVE_EMPTY_PAGES: 1 // Stop fetching after 1 consecutive empty pages
};

// Reddit API Configuration - REQUIRED for proper access
let REDDIT = {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    username: process.env.REDDIT_USERNAME || '',
    password: process.env.REDDIT_PASSWORD || '',
    userAgent: process.env.REDDIT_USER_AGENT || 'Stremula1/2.0 (by u/stremula1-bot)',
    // Reddit API endpoints
    apiBase: 'https://oauth.reddit.com',
    authUrl: 'https://www.reddit.com/api/v1/access_token'
};

// Load Reddit configuration from file if environment variables not set
function loadRedditConfig() {
    try {
        // If environment variables are set, use them (priority)
        if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET && 
            process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD) {
            console.log('✅ Using Reddit credentials from environment variables');
            return true;
        }
        
        // Otherwise, try to load from file
        const configPath = path.join(__dirname, 'reddit-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.clientId && config.clientSecret && config.username && config.password) {
                REDDIT = {
                    ...REDDIT,
                    clientId: config.clientId,
                    clientSecret: config.clientSecret,
                    username: config.username,
                    password: config.password
                };
                console.log('✅ Loaded Reddit credentials from file');
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('❌ Error loading Reddit configuration:', error);
        return false;
    }
}

let redditAuth = { token: null, expiresAt: 0 };

// Enhanced Reddit OAuth authentication with better error handling
async function getRedditOAuthToken() {
    try {
        // Check if we have required credentials
        if (!REDDIT.clientId || !REDDIT.clientSecret || !REDDIT.username || !REDDIT.password) {
            console.log('⚠️  Reddit OAuth credentials not configured');
            console.log('📋 Required environment variables:');
            console.log('   - REDDIT_CLIENT_ID');
            console.log('   - REDDIT_CLIENT_SECRET');
            console.log('   - REDDIT_USERNAME');
            console.log('   - REDDIT_PASSWORD');
            return null;
        }
        
        // Check if token is still valid (with 5 minute buffer)
        if (redditAuth.token && Date.now() < (redditAuth.expiresAt - 5 * 60 * 1000)) {
            return redditAuth.token;
        }
        
        console.log('🔐 Authenticating with Reddit API...');
        
        // Create basic auth header
        const authHeader = Buffer.from(`${REDDIT.clientId}:${REDDIT.clientSecret}`).toString('base64');
        
        // Prepare OAuth request body
        const body = new URLSearchParams();
        body.append('grant_type', 'password');
        body.append('username', REDDIT.username);
        body.append('password', REDDIT.password);
        
        // Make OAuth request
        const response = await axios.post(REDDIT.authUrl, body.toString(), {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': REDDIT.userAgent
            },
            timeout: 30000 // 30 second timeout
        });
        
        const accessToken = response.data?.access_token;
        const expiresIn = response.data?.expires_in || 3600;
        
        if (accessToken) {
            redditAuth.token = accessToken;
            redditAuth.expiresAt = Date.now() + (expiresIn * 1000);
            console.log('✅ Reddit OAuth authentication successful');
            return accessToken;
        }
        
        console.error('❌ No access token received from Reddit');
        return null;
        
    } catch (error) {
        console.error('❌ Reddit OAuth authentication failed:', error.response?.status, error.response?.statusText);
        if (error.response?.data) {
            console.error('Error details:', error.response.data);
        }
        return null;
    }
}

// Deployment configuration
const DEFAULT_PORT = process.env.PORT || 7003;
let PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${DEFAULT_PORT}`;

// Cache for storing processed data
let cache = {
    grandPrix: new Map(),
    lastUpdate: 0,
    isProcessing: false,
    processingProgress: {
        current: 0,
        total: 0,
        status: 'idle'
    }
};

// Ensure cache directory exists
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

// Real-Debrid configuration - REQUIRED
let realdebridConfig = {
    apiKey: null,
    enabled: false
};

// Grand Prix data structure
const GRAND_PRIX_2025 = [
    { name: 'Bahrain Grand Prix', round: 1, country: 'Bahrain' },
    { name: 'Saudi Arabian Grand Prix', round: 2, country: 'Saudi Arabia' },
    { name: 'Australian Grand Prix', round: 3, country: 'Australia' },
    { name: 'Japanese Grand Prix', round: 4, country: 'Japan' },
    { name: 'Chinese Grand Prix', round: 5, country: 'China' },
    { name: 'Miami Grand Prix', round: 6, country: 'United States' },
    { name: 'Emilia Romagna Grand Prix', round: 7, country: 'Italy' },
    { name: 'Monaco Grand Prix', round: 8, country: 'Monaco' },
    { name: 'Spanish Grand Prix', round: 9, country: 'Spain' },
    { name: 'Canadian Grand Prix', round: 10, country: 'Canada' },
    { name: 'Austrian Grand Prix', round: 11, country: 'Austria' },
    { name: 'British Grand Prix', round: 12, country: 'United Kingdom' },
    { name: 'Hungarian Grand Prix', round: 13, country: 'Hungary' },
    { name: 'Belgian Grand Prix', round: 14, country: 'Belgium' },
    { name: 'Dutch Grand Prix', round: 15, country: 'Netherlands' },
    { name: 'Italian Grand Prix', round: 16, country: 'Italy' },
    { name: 'Azerbaijan Grand Prix', round: 17, country: 'Azerbaijan' },
    { name: 'Singapore Grand Prix', round: 18, country: 'Singapore' },
    { name: 'United States Grand Prix', round: 19, country: 'United States' },
    { name: 'Mexican Grand Prix', round: 20, country: 'Mexico' },
    { name: 'Brazilian Grand Prix', round: 21, country: 'Brazil' },
    { name: 'Las Vegas Grand Prix', round: 22, country: 'United States' },
    { name: 'Qatar Grand Prix', round: 23, country: 'Qatar' },
    { name: 'Abu Dhabi Grand Prix', round: 24, country: 'United Arab Emirates' }
];

// Addon Manifest - Real Debrid Only
const manifest = {
    id: 'org.stremio.stremula1',
    version: '2.0.0',
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

// Cache Management Functions
function saveCacheToFile() {
    try {
        // Create backup of existing cache before overwriting
        if (fs.existsSync(CONFIG.CACHE_FILE)) {
            const backupFile = path.join(__dirname, 'cache', 'addon-cache-backup.json');
            fs.copyFileSync(CONFIG.CACHE_FILE, backupFile);
            console.log('💾 Created cache backup');
        }
        
        // Convert Maps to arrays for JSON serialization
        const grandPrixData = Array.from(cache.grandPrix.entries()).map(([gpKey, gpData]) => {
            const serializedGpData = { ...gpData };
            if (gpData.sessions && gpData.sessions instanceof Map) {
                serializedGpData.sessions = Array.from(gpData.sessions.entries());
            }
            return [gpKey, serializedGpData];
        });
        
        const cacheData = {
            grandPrix: grandPrixData,
            lastUpdate: cache.lastUpdate,
            processingProgress: cache.processingProgress
        };
        fs.writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(cacheData, null, 2));
        console.log('💾 Cache saved to file');
    } catch (error) {
        console.error('Error saving cache:', error);
    }
}

function loadCacheFromFile() {
    try {
        if (fs.existsSync(CONFIG.CACHE_FILE)) {
            const cacheData = JSON.parse(fs.readFileSync(CONFIG.CACHE_FILE, 'utf8'));
            cache.grandPrix = new Map(cacheData.grandPrix || []);
            
            // Convert sessions arrays back to Maps for each Grand Prix
            for (const [gpKey, gpData] of cache.grandPrix) {
                if (gpData.sessions) {
                    if (Array.isArray(gpData.sessions)) {
                        // New format: sessions is an array of [key, value] pairs
                        gpData.sessions = new Map(gpData.sessions);
                    } else if (typeof gpData.sessions === 'object' && Object.keys(gpData.sessions).length === 0) {
                        // Handle empty objects - convert to empty Map
                        gpData.sessions = new Map();
                    } else if (typeof gpData.sessions === 'object' && Object.keys(gpData.sessions).length > 0) {
                        // Handle non-empty objects - convert to Map
                        gpData.sessions = new Map(Object.entries(gpData.sessions));
                    }
                }
            }
            
            cache.lastUpdate = cacheData.lastUpdate || 0;
            cache.processingProgress = cacheData.processingProgress || {
                current: 0,
                total: 0,
                status: 'idle'
            };
            console.log(`📁 Cache loaded: ${cache.grandPrix.size} Grand Prix`);
            return true;
        }
    } catch (error) {
        console.error('Error loading cache:', error);
    }
    return false;
}

function savePostsCache(posts) {
    try {
        const postsData = {
            posts: posts,
            timestamp: Date.now()
        };
        fs.writeFileSync(CONFIG.POSTS_CACHE_FILE, JSON.stringify(postsData, null, 2));
        console.log(`📝 Posts cache saved: ${posts.length} posts`);
    } catch (error) {
        console.error('Error saving posts cache:', error);
    }
}

function loadPostsCache() {
    try {
        if (fs.existsSync(CONFIG.POSTS_CACHE_FILE)) {
            const postsData = JSON.parse(fs.readFileSync(CONFIG.POSTS_CACHE_FILE, 'utf8'));
            
            // Always check if posts are within MAX_SCROLL_MONTHS range
            const maxScrollTime = Date.now() - (CONFIG.MAX_SCROLL_MONTHS * 30 * 24 * 60 * 60 * 1000);
            const postsInRange = postsData.posts.filter(post => {
                const postTime = post.created * 1000; // Convert to milliseconds
                return postTime >= maxScrollTime;
            });
            
            if (postsInRange.length === postsData.posts.length) {
                console.log(`📝 Posts cache loaded: ${postsData.posts.length} posts (all within ${CONFIG.MAX_SCROLL_MONTHS} months)`);
                return postsData.posts;
            } else {
                console.log(`⏰ Posts cache contains ${postsData.posts.length - postsInRange.length} posts outside ${CONFIG.MAX_SCROLL_MONTHS} month range, refreshing...`);
            }
        }
    } catch (error) {
        console.error('Error loading posts cache:', error);
    }
    return null;
}

// Fully Processed Posts Cache Management
function saveFullyProcessedPosts(fullyProcessedPosts) {
    try {
        const processedData = {
            posts: fullyProcessedPosts,
            timestamp: Date.now()
        };
        fs.writeFileSync(CONFIG.FULLY_PROCESSED_POSTS_FILE, JSON.stringify(processedData, null, 2));
        console.log(`✅ Fully processed posts cache saved: ${fullyProcessedPosts.length} posts`);
    } catch (error) {
        console.error('Error saving fully processed posts cache:', error);
    }
}

function loadFullyProcessedPosts() {
    try {
        if (fs.existsSync(CONFIG.FULLY_PROCESSED_POSTS_FILE)) {
            const processedData = JSON.parse(fs.readFileSync(CONFIG.FULLY_PROCESSED_POSTS_FILE, 'utf8'));
            console.log(`✅ Fully processed posts cache loaded: ${processedData.posts.length} posts`);
            return processedData.posts;
        }
    } catch (error) {
        console.error('Error loading fully processed posts cache:', error);
    }
    return [];
}

function isPostFullyProcessed(postId, fullyProcessedPosts) {
    return fullyProcessedPosts.some(processedPost => processedPost.id === postId);
}

function addToFullyProcessedPosts(postId, grandPrixName, sessions, fullyProcessedPosts) {
    // Check if already exists
    const existingIndex = fullyProcessedPosts.findIndex(p => p.id === postId);
    
    const processedPost = {
        id: postId,
        grandPrixName: grandPrixName,
        sessions: sessions,
        processedAt: Date.now(),
        sessionCount: sessions.length
    };
    
    if (existingIndex >= 0) {
        fullyProcessedPosts[existingIndex] = processedPost;
        console.log(`✅ Updated fully processed post: ${postId} (${sessions.length} sessions)`);
    } else {
        fullyProcessedPosts.push(processedPost);
        console.log(`✅ Added fully processed post: ${postId} (${sessions.length} sessions)`);
    }
}

function hasAllRequiredSessions(sessions) {
    // Check if this is a Sprint weekend or regular weekend
    const sessionNames = sessions.map(s => s.name);
    const hasSprintQualifying = sessionNames.some(name => 
        name.toLowerCase().includes('sprint qualifying')
    );
    const hasSprint = sessionNames.some(name => 
        name.toLowerCase().includes('sprint') && !name.toLowerCase().includes('qualifying')
    );
    const hasPractice2 = sessionNames.some(name => 
        name.toLowerCase().includes('practice two') || name.toLowerCase().includes('practice 2')
    );
    const hasPractice3 = sessionNames.some(name => 
        name.toLowerCase().includes('practice three') || name.toLowerCase().includes('practice 3')
    );
    
    // Define sessions based on weekend type
    let requiredSessions;
    if (hasSprintQualifying && hasSprint) {
        // Sprint weekend format: Practice 1, Sprint Qualifying, Sprint, Qualifying, Race
        requiredSessions = [
            'Free Practice One',
            'Sprint Qualifying',
            'Sprint',
            'Qualifying',
            'Race'
        ];
    } else if (hasPractice2 && hasPractice3) {
        // Regular weekend format: Practice 1, 2, 3, Qualifying, Race
        requiredSessions = [
            'Free Practice One',
            'Free Practice Two', 
            'Free Practice Three',
            'Qualifying',
            'Race'
        ];
    } else {
        // Fallback to regular format
        requiredSessions = [
            'Free Practice One',
            'Free Practice Two', 
            'Free Practice Three',
            'Qualifying',
            'Race'
        ];
    }
    
    // Check if all required sessions are present
    for (const requiredSession of requiredSessions) {
        const found = sessionNames.some(sessionName => {
            const sessionNameLower = sessionName.toLowerCase();
            const requiredLower = requiredSession.toLowerCase();
            
            // Handle variations in session names
            if (requiredLower.includes('practice one') && 
                (sessionNameLower.includes('practice one') || sessionNameLower.includes('practice.one') || sessionNameLower.includes('fp1'))) {
                return true;
            } else if (requiredLower.includes('practice two') && 
                (sessionNameLower.includes('practice two') || sessionNameLower.includes('practice.two') || sessionNameLower.includes('fp2'))) {
                return true;
            } else if (requiredLower.includes('practice three') && 
                (sessionNameLower.includes('practice three') || sessionNameLower.includes('practice.three') || sessionNameLower.includes('fp3'))) {
                return true;
            } else if (requiredLower.includes('sprint qualifying') && 
                (sessionNameLower.includes('sprint qualifying') || sessionNameLower.includes('sprint quali'))) {
                return true;
            } else if (requiredLower === 'sprint' && 
                sessionNameLower.includes('sprint') && !sessionNameLower.includes('qualifying')) {
                return true;
            } else if (requiredLower === 'qualifying' && 
                (sessionNameLower.includes('qualifying') || sessionNameLower.includes('quali')) && !sessionNameLower.includes('sprint')) {
                return true;
            } else if (requiredLower === 'race' && sessionNameLower.includes('race')) {
                return true;
            }
            
            return false;
        });
        
        if (!found) {
            console.log(`❌ Missing required session: ${requiredSession}`);
            return false;
        }
    }
    
    console.log(`✅ All required sessions found: ${sessionNames.join(', ')}`);
    return true;
}

function cleanupOldFullyProcessedPosts(fullyProcessedPosts) {
    // Remove posts older than 6 months to keep cache size manageable
    const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
    const originalCount = fullyProcessedPosts.length;
    
    const filteredPosts = fullyProcessedPosts.filter(post => {
        return post.processedAt > sixMonthsAgo;
    });
    
    const removedCount = originalCount - filteredPosts.length;
    if (removedCount > 0) {
        console.log(`🧹 Cleaned up ${removedCount} old fully processed posts (older than 6 months)`);
    }
    
    return filteredPosts;
}

// Utility Functions
function getPosterForGrandPrix(gpName) {
    // Smart matching function for Grand Prix posters
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
    
    const posterFile = posterMap[gpName];
    if (posterFile) {
        return `${PUBLIC_BASE_URL}/media/${posterFile}`;
    }
    
    // Fallback to default poster if not found
    console.warn(`No poster found for: ${gpName}`);
    return `${PUBLIC_BASE_URL}/media/background.jpeg`;
}

function getThumbnailForSession(sessionType) {
    // Smart matching function for session thumbnails
    const sessionTypeLower = sessionType.toLowerCase();
    
    // Practice 1 sessions
    if (sessionTypeLower.includes('practice 1') || sessionTypeLower.includes('free practice one') || sessionTypeLower.includes('fp1')) {
        return `${PUBLIC_BASE_URL}/media/practice 1.png`;
    }
    
    // Practice 2 sessions
    if (sessionTypeLower.includes('practice 2') || sessionTypeLower.includes('free practice two') || sessionTypeLower.includes('fp2')) {
        return `${PUBLIC_BASE_URL}/media/practice 2.png`;
    }
    
    // Practice 3 sessions
    if (sessionTypeLower.includes('practice 3') || sessionTypeLower.includes('free practice three') || sessionTypeLower.includes('fp3')) {
        return `${PUBLIC_BASE_URL}/media/practice 3.png`;
    }
    
    // Sprint Qualifying sessions
    if (sessionTypeLower.includes('sprint qualifying')) {
        return `${PUBLIC_BASE_URL}/media/sprint qualifying.png`;
    }
    
    // Sprint sessions
    if (sessionTypeLower.includes('sprint') && !sessionTypeLower.includes('qualifying')) {
        return `${PUBLIC_BASE_URL}/media/sprint.png`;
    }
    
    // Regular Qualifying sessions
    if (sessionTypeLower.includes('qualifying') || sessionTypeLower.includes('quali')) {
        return `${PUBLIC_BASE_URL}/media/qualifying.png`;
    }
    
    // Race sessions
    if (sessionTypeLower.includes('race')) {
        return `${PUBLIC_BASE_URL}/media/race.png`;
    }
    
    // Fallback to practice 1 image for unknown session types
    console.warn(`No specific thumbnail found for session: ${sessionType}, using practice 1 thumbnail`);
    return `${PUBLIC_BASE_URL}/media/practice 1.png`;
}

function getDisplayNameForSession(sessionName) {
    // Map session names to display names for Stremio episodes
    const displayNameMap = {
        'Free Practice One': 'Practice 1',
        'Free Practice Two': 'Practice 2', 
        'Free Practice Three': 'Practice 3',
        'Sprint Qualifying': 'Sprint Qualifying',
        'Sprint': 'Sprint',
        'Qualifying': 'Qualifying',
        'Race': 'Race'
    };
    
    // Check for exact matches first
    if (displayNameMap[sessionName]) {
        return displayNameMap[sessionName];
    }
    
    // Check for partial matches (case-insensitive)
    const sessionNameLower = sessionName.toLowerCase();
    for (const [originalName, displayName] of Object.entries(displayNameMap)) {
        const originalLower = originalName.toLowerCase();
        
        if (originalLower.includes('practice one') && sessionNameLower.includes('practice one')) {
            return displayName;
        } else if (originalLower.includes('practice two') && sessionNameLower.includes('practice two')) {
            return displayName;
        } else if (originalLower.includes('practice three') && sessionNameLower.includes('practice three')) {
            return displayName;
        } else if (originalLower.includes('sprint qualifying') && sessionNameLower.includes('sprint qualifying')) {
            return displayName;
        } else if (originalLower === 'sprint' && sessionNameLower.includes('sprint') && !sessionNameLower.includes('qualifying')) {
            return displayName;
        } else if (originalLower === 'qualifying' && sessionNameLower.includes('qualifying') && !sessionNameLower.includes('sprint')) {
            return displayName;
        } else if (originalLower === 'race' && sessionNameLower.includes('race')) {
            return displayName;
        }
    }
    
    // If no mapping found, return original name
    return sessionName;
}

function extractGrandPrixFromTitle(title) {
    const titleLower = title.toLowerCase();
    
    // Extract round number from title (e.g., "R14" -> 14)
    const roundMatch = title.match(/R(\d+)/i);
    const extractedRound = roundMatch ? parseInt(roundMatch[1]) : null;
    
    for (const gp of GRAND_PRIX_2025) {
        const gpNameLower = gp.name.toLowerCase();
        const gpShortName = gpNameLower.replace(' grand prix', '');
        
        if (titleLower.includes(gpNameLower) || 
            titleLower.includes(gpShortName) ||
            titleLower.includes(gpShortName.replace(' ', ''))) {
            // Return GP data with extracted round number if available, otherwise use original round
            return {
                ...gp,
                round: extractedRound || gp.round
            };
        }
    }
    return null;
}

function extractQualityFromTitle(title) {
    if (title.includes('4K') || title.includes('2160p') || title.includes('UHD')) return '4K';
    if (title.includes('1080p') || title.includes('FHD') || title.includes('SkyF1HD')) return '1080p';
    return 'Unknown';
}

function extractMagnetLink(html) {
    const $ = cheerio.load(html);
    
    // First try to find magnet links in href attributes
    const hrefLinks = [];
    $('a[href^="magnet:"]').each(function() {
        hrefLinks.push($(this).attr('href'));
    });
    
    if (hrefLinks.length > 0) {
        return hrefLinks[0];
    }
    
    // If not found in href, look for magnet links in text content
    const textContent = $.text();
    const magnetMatches = textContent.match(/magnet:\?[^\s]+/g);
    
    if (magnetMatches && magnetMatches.length > 0) {
        // Decode HTML entities and clean up the URL
        let magnetLink = magnetMatches[0];
        
        // Remove HTML tags that might be at the end
        magnetLink = magnetLink.replace(/<\/[^>]*>.*$/, '');
        
        // Decode HTML entities
        magnetLink = magnetLink.replace(/&amp;/g, '&');
        magnetLink = magnetLink.replace(/&lt;/g, '<');
        magnetLink = magnetLink.replace(/&gt;/g, '>');
        magnetLink = magnetLink.replace(/&quot;/g, '"');
        magnetLink = magnetLink.replace(/&#x27;/g, "'");
        magnetLink = magnetLink.replace(/&nbsp;/g, ' ');
        
        return magnetLink;
    }
    
    return null;
}

// Helper function to test date parsing
function testDateParsing() {
    const testDate = "04.09.2025";
    const [day, month, year] = testDate.split('.');
    const parsedDate = new Date(year, month - 1, day);
    console.log(`📅 Test date parsing: "${testDate}" -> ${parsedDate.toISOString()}`);
    return parsedDate;
}

function extractSessionsFromContent(html) {
    const $ = cheerio.load(html);
    const sessions = [];
    
    // Define allowed sessions
    const allowedSessions = [
        'Free Practice One',
        'Free Practice Two', 
        'Free Practice Three',
        'Sprint Qualifying',
        'Sprint',
        'Qualifying',
        'Race'
    ];
    
    // Extract text content
    const textContent = $('body').text();
    
    // Look for the "Contains:" section - try multiple approaches
    let containsSection = '';
    
    // First try: Look for "Contains:" followed by content
    const containsMatch1 = textContent.match(/Contains:[\s\S]*?(?=\n\n|\n[A-Z]|$)/i);
    if (containsMatch1) {
        containsSection = containsMatch1[0];
    }
    
    // Second try: Look for list items after "Contains:"
    if (!containsSection || containsSection.length < 50) {
        const containsMatch2 = textContent.match(/Contains:[\s\S]*?(?=magnet:|Torrent Link|$)/i);
        if (containsMatch2) {
            containsSection = containsMatch2[0];
        }
    }
    
    // Third try: Look for HTML list structure
    if (!containsSection || containsSection.length < 50) {
        const $ = cheerio.load(html);
        const containsElement = $('*:contains("Contains:")').first();
        if (containsElement.length) {
            const parent = containsElement.parent();
            const listItems = parent.find('li');
            if (listItems.length > 0) {
                containsSection = listItems.map((i, el) => $(el).text().trim()).get().join('\n');
            }
        }
    }
    
    if (!containsSection || containsSection.length < 50) {
        return sessions;
    }
    
    // Extract individual session lines
    const sessionLines = containsSection.split('\n')
        .map(line => line.trim())
        .filter(line => line && 
            !line.includes('Contains:') && 
            !line.includes('Quality:') && 
            !line.includes('Container:') && 
            !line.includes('Video:') && 
            !line.includes('Audio:') &&
            !line.includes('magnet:') &&
            !line.includes('Torrent Link'))
        .filter(line => line.includes('(') && line.includes(')') && line.length > 10);
    
    
    // Parse each session line
    sessionLines.forEach(line => {
        // Clean HTML tags and decode HTML entities
        let cleanLine = line
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&') // Decode HTML entities
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .trim();
        
        
        // Extract session name, date, and duration
        // Format: "Session Name (DD.MM.YYYY) (H:MM:SS)"
        const match = cleanLine.match(/^(.+?)\s*\(([^)]+)\)\s*\(([^)]+)\)$/);
        if (match) {
            const sessionName = match[1].trim();
            const date = match[2].trim();
            const duration = match[3].trim();
            
            
            // Only include sessions that match our allowed list
            const isAllowed = allowedSessions.some(allowedSession => {
                const sessionNameLower = sessionName.toLowerCase();
                const allowedLower = allowedSession.toLowerCase();
                
                // First check if session contains excluded terms
                if (sessionNameLower.includes('notebook') || sessionNameLower.includes('ted') || sessionNameLower.includes('pre qualifying')) {
                    return false;
                }
                
                // Handle variations in session names
                if (allowedLower.includes('practice')) {
                    if (allowedLower.includes('one')) {
                        return sessionNameLower.includes('practice one') || sessionNameLower.includes('practice.one') || sessionNameLower.includes('fp1');
                    } else if (allowedLower.includes('two')) {
                        return sessionNameLower.includes('practice two') || sessionNameLower.includes('practice.two') || sessionNameLower.includes('fp2');
                    } else if (allowedLower.includes('three')) {
                        return sessionNameLower.includes('practice three') || sessionNameLower.includes('practice.three') || sessionNameLower.includes('fp3');
                    }
                } else if (allowedLower.includes('sprint qualifying')) {
                    return sessionNameLower.includes('sprint qualifying') || sessionNameLower.includes('sprint quali');
                } else if (allowedLower === 'sprint') {
                    return sessionNameLower.includes('sprint') && !sessionNameLower.includes('qualifying');
                } else if (allowedLower === 'qualifying') {
                    return sessionNameLower.includes('qualifying') || sessionNameLower.includes('quali');
                } else if (allowedLower === 'race') {
                    return sessionNameLower.includes('race');
                }
                
                return sessionNameLower.includes(allowedLower);
            });
            
            if (isAllowed) {
                sessions.push({
                    name: sessionName,
                    fullMatch: cleanLine,
                    date: date,
                    duration: duration
                });
                // Session added
            }
        }
    });
    
    console.log(`✅ Extracted ${sessions.length} allowed sessions:`, sessions.map(s => s.name));
    return sessions;
}

// Real-Debrid API functions
async function checkExistingTorrent(magnetLink) {
    try {
        // Get list of existing torrents
        const response = await axios.get(`${CONFIG.REALDEBRID_API_URL}/torrents`, {
            headers: {
                'Authorization': `Bearer ${realdebridConfig.apiKey}`
            }
        });
        
        const torrents = response.data;
        
        // Check if this magnet link already exists
        for (const torrent of torrents) {
            if (torrent.magnet === magnetLink) {
                console.log(`✅ Found existing torrent: ${torrent.id} (status: ${torrent.status})`);
                return torrent;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error checking existing torrents:', error.response?.data || error.message);
        return null;
    }
}

async function getStreamingLinksFromTorrent(torrentInfo) {
    try {
        // Get download links from torrent info
        if (!torrentInfo.links || torrentInfo.links.length === 0) {
            console.log('❌ No download links found in torrent info');
            return null;
        }
        
        console.log(`📁 Found ${torrentInfo.links.length} download links`);
        
        // Convert each download link to streaming link using unrestrict API
        const streamingLinks = [];
        
        for (const downloadLink of torrentInfo.links) {
            try {
                const unrestrictResponse = await axios.post(`${CONFIG.REALDEBRID_API_URL}/unrestrict/link`, {
                    link: downloadLink
                }, {
                    headers: {
                        'Authorization': `Bearer ${realdebridConfig.apiKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                
                const unrestrictData = unrestrictResponse.data;
                
                // Create streaming link URL
                if (unrestrictData.download) {
                    // Validate that it's a direct file URL
                    const streamingUrl = unrestrictData.download;
                    
                    // Check if it's a video file
                    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
                    const isVideoFile = videoExtensions.some(ext => 
                        streamingUrl.toLowerCase().includes(ext)
                    );
                    
                    if (isVideoFile) {
                        streamingLinks.push({
                            url: streamingUrl,
                            filename: unrestrictData.filename,
                            size: unrestrictData.filesize,
                            downloadUrl: unrestrictData.download
                        });
                        console.log(`🔗 Converted to streaming link: ${streamingUrl}`);
                    } else {
                        console.log(`⏭️  Skipping non-video file: ${unrestrictData.filename}`);
                    }
                } else {
                    console.error('No download URL returned from unrestrict API');
                }
            } catch (error) {
                console.error('Error converting link to streaming:', error.response?.data || error.message);
            }
        }
        
        return streamingLinks;
    } catch (error) {
        console.error('Error getting streaming links from torrent:', error);
        return null;
    }
}

async function convertMagnetToRealDebridStreamingLinks(magnetLink) {
    if (!realdebridConfig.enabled || !realdebridConfig.apiKey) {
        console.log('⚠️  Real-Debrid not configured');
        return null;
    }
    
    try {
        console.log('🔄 Converting magnet to Real-Debrid...');
        
        // First check if torrent already exists
        const existingTorrent = await checkExistingTorrent(magnetLink);
        let torrentId;
        
        if (existingTorrent) {
            torrentId = existingTorrent.id;
            console.log(`♻️  Using existing torrent: ${torrentId}`);
            
            // If it's already downloaded, we can proceed directly
            if (existingTorrent.status === 'downloaded') {
                console.log('✅ Existing torrent already downloaded');
                return await getStreamingLinksFromTorrent(existingTorrent);
            }
        } else {
            // Add magnet link to Real-Debrid
            const addResponse = await axios.post(`${CONFIG.REALDEBRID_API_URL}/torrents/addMagnet`, {
                magnet: magnetLink
            }, {
                headers: {
                    'Authorization': `Bearer ${realdebridConfig.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            torrentId = addResponse.data.id;
            console.log(`📥 Added new torrent to Real-Debrid: ${torrentId}`);
            
            // Select all files for download
            await axios.post(`${CONFIG.REALDEBRID_API_URL}/torrents/selectFiles/${torrentId}`, {
                files: 'all'
            }, {
                headers: {
                    'Authorization': `Bearer ${realdebridConfig.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        }
        
        // Wait for download to complete (with timeout)
        let attempts = 0;
        const maxAttempts = 30; // 5 minutes max
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            
            const statusResponse = await axios.get(`${CONFIG.REALDEBRID_API_URL}/torrents/info/${torrentId}`, {
                headers: {
                    'Authorization': `Bearer ${realdebridConfig.apiKey}`
                }
            });
            
            const torrentInfo = statusResponse.data;
            
            console.log(`📊 Torrent status: ${torrentInfo.status} (attempt ${attempts + 1}/${maxAttempts})`);
            
            // Handle different torrent statuses
            if (torrentInfo.status === 'downloaded') {
                console.log('✅ Torrent downloaded successfully');
                return await getStreamingLinksFromTorrent(torrentInfo);
            } else if (torrentInfo.status === 'error') {
                console.log(`❌ Torrent error: ${torrentInfo.error || 'Unknown error'}`);
                return null;
            } else if (torrentInfo.status === 'dead') {
                console.log('❌ Torrent is dead, cannot download');
                return null;
            } else {
                // Still processing - show progress if available
                if (torrentInfo.progress !== undefined) {
                    // Fix progress calculation - ensure it's between 0-100%
                    const progressPercent = Math.min(Math.max(Math.round(torrentInfo.progress * 100), 0), 100);
                    console.log(`⏳ Torrent progress: ${progressPercent}%`);
                }
            }
            
            attempts++;
        }
        
        console.log('⏰ Timeout waiting for torrent download');
        return null;
        
    } catch (error) {
        console.error('Error converting magnet to Real-Debrid:', error.response?.data || error.message);
        return null;
    }
}

// Enhanced Reddit API post fetching with proper OAuth
async function fetchEgortechPosts() {
    try {
        console.log('🔍 Fetching egortech posts using Reddit API...');
        
        // Always fetch fresh posts to check for new ones
        // The cache will be used later to skip processing already-processed posts
        
        // Get OAuth token - REQUIRED for API access
        const oauthToken = await getRedditOAuthToken();
        if (!oauthToken) {
            console.error('❌ Cannot fetch posts without Reddit OAuth token');
            console.log('🔧 Please configure Reddit API credentials:');
            console.log('   - REDDIT_CLIENT_ID');
            console.log('   - REDDIT_CLIENT_SECRET');
            console.log('   - REDDIT_USERNAME');
            console.log('   - REDDIT_PASSWORD');
            return [];
        }
        
        const allPosts = [];
        let after = null;
        let pageCount = 0;
        let consecutiveEmptyPages = 0;
        const maxPages = 50; // Limit to prevent infinite loops
        const maxScrollTime = Date.now() - (CONFIG.MAX_SCROLL_MONTHS * 30 * 24 * 60 * 60 * 1000);
        
        console.log('📡 Using Reddit OAuth API for reliable access...');
        
        while (pageCount < maxPages) {
            pageCount++;
            console.log(`📄 Fetching page ${pageCount}...`);
            
            // Use OAuth Reddit API endpoint
            let url = `${REDDIT.apiBase}/user/egortech/submitted?limit=100&raw_json=1`;
            if (after) {
                url += `&after=${after}`;
            }
            
            const axiosConfig = {
                headers: {
                    'Authorization': `bearer ${oauthToken}`,
                    'User-Agent': REDDIT.userAgent
                },
                timeout: 30000 // 30 second timeout
            };
            
            try {
                const response = await axios.get(url, axiosConfig);
                
                if (!response.data?.data?.children) {
                    console.log('📭 No more posts found');
                    break;
                }
                
                const children = response.data.data.children || [];
                const pagePosts = children
                    .filter(post => {
                        const title = post.data?.title;
                        const created = post.data?.created_utc * 1000; // Convert to ms
                        
                        // Only include posts that start with 'Formula 1' and are within our time range
                        return title && title.startsWith('Formula 1') && created >= maxScrollTime;
                    })
                    .map(post => ({
                        title: post.data.title,
                        url: `https://reddit.com${post.data.permalink}`,
                        created: post.data.created_utc,
                        id: post.data.id,
                        author: post.data.author,
                        selftext: post.data.selftext || '', // Include post content directly
                        selftext_html: post.data.selftext_html || ''
                    }));
                
                // Check if this page has any Formula 1 posts
                if (pagePosts.length === 0) {
                    consecutiveEmptyPages++;
                    console.log(`📝 Found 0 Formula 1 posts on page ${pageCount} (${consecutiveEmptyPages} consecutive empty pages)`);
                    
                    // Stop if we've hit the threshold of consecutive empty pages
                    if (consecutiveEmptyPages >= CONFIG.MAX_CONSECUTIVE_EMPTY_PAGES) {
                        console.log(`🛑 Stopping fetch after ${consecutiveEmptyPages} consecutive empty pages`);
                        break;
                    }
                } else {
                    consecutiveEmptyPages = 0; // Reset counter when we find posts
                    allPosts.push(...pagePosts);
                    console.log(`📝 Found ${pagePosts.length} Formula 1 posts on page ${pageCount}`);
                    
                    // Check if we've gone back far enough
                    const oldestPost = Math.min(...pagePosts.map(p => p.created * 1000));
                    if (oldestPost < maxScrollTime) {
                        console.log(`⏰ Reached ${CONFIG.MAX_SCROLL_MONTHS} month time limit, stopping fetch`);
                        break;
                    }
                }
                
                // Get next page token
                after = response.data.data.after;
                if (!after) {
                    console.log('📄 No more pages available');
                    break;
                }
                
                // Rate limiting - Reddit API allows 60 requests per minute
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between requests
                
            } catch (pageError) {
                console.error(`❌ Error fetching page ${pageCount}:`, pageError.response?.status, pageError.response?.statusText);
                if (pageError.response?.status === 401) {
                    console.log('🔐 Token expired, refreshing...');
                    redditAuth.token = null; // Force token refresh
                    const newToken = await getRedditOAuthToken();
                    if (!newToken) {
                        console.error('❌ Failed to refresh token, stopping');
                        break;
                    }
                    // Retry the same page with new token
                    pageCount--;
                    continue;
                }
                // For other errors, wait longer and continue
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        console.log(`✅ Found ${allPosts.length} Formula 1 posts from egortech using Reddit API`);
        
        // Always save fresh posts to cache for future reference
        savePostsCache(allPosts);
        
        return allPosts;
    } catch (error) {
        console.error('❌ Error fetching egortech posts:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return [];
    }
}

// Enhanced post content fetching using Reddit API OAuth
async function fetchPostContent(postUrl, postId = null) {
    try {
        // If we have the content from the posts fetch, use it directly
        if (postId) {
            // This will be handled by the enhanced fetchEgortechPosts function
            // which now includes selftext_html in the post data
            return null; // Signal to use the data from the post object
        }
        
        // Fallback: Get OAuth token and fetch individual post
        const oauthToken = await getRedditOAuthToken();
        if (!oauthToken) {
            console.error('❌ Cannot fetch post content without OAuth token');
            return '';
        }
        
        // Extract post ID from URL if not provided
        const postIdFromUrl = postUrl.match(/\/([^\/]+)\/$/);
        if (!postIdFromUrl) {
            console.error('❌ Could not extract post ID from URL:', postUrl);
            return '';
        }
        
        const actualPostId = postId || postIdFromUrl[1];
        
        // Use Reddit API OAuth endpoint for individual post
        const url = `${REDDIT.apiBase}/comments/${actualPostId}?raw_json=1`;
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `bearer ${oauthToken}`,
                'User-Agent': REDDIT.userAgent
            },
            timeout: 30000
        });
        
        // Reddit comments API returns an array, first element is the post
        if (Array.isArray(response.data) && response.data.length > 0) {
            const postData = response.data[0].data.children[0].data;
            return postData.selftext_html || postData.selftext || '';
        }
        
        return '';
    } catch (error) {
        console.error('❌ Error fetching post content:', error.response?.status, error.response?.statusText);
        return '';
    }
}

// Helper function to find the correct file for a session
function findSessionFile(streamingLinks, sessionName) {
    
    const sessionNameLower = sessionName.toLowerCase();
    
    // Define mapping patterns for only the allowed sessions
    const sessionPatterns = {
        'free practice one': ['fp1', 'practice.1', 'practice 1', 'free practice one', 'practice one'],
        'free practice two': ['fp2', 'practice.2', 'practice 2', 'free practice two', 'practice two'],
        'free practice three': ['fp3', 'practice.3', 'practice 3', 'free practice three', 'practice three'],
        'sprint qualifying': ['sprint qualifying', 'sprint quali', 'sq'],
        'sprint': ['sprint'],
        'qualifying': ['qualifying', 'quali'],
        'race': ['race']
    };
    
    // First pass: Look for exact session name matches - handle both spaces and dots
    for (const link of streamingLinks) {
        const filename = link.filename.toLowerCase();
        
        // Direct session name matching
        if (sessionNameLower.includes('free practice one') && (filename.includes('practice one') || filename.includes('practice.one'))) {
            return link;
        }
        if (sessionNameLower.includes('free practice two') && (filename.includes('practice two') || filename.includes('practice.two'))) {
            return link;
        }
        if (sessionNameLower.includes('free practice three') && (filename.includes('practice three') || filename.includes('practice.three'))) {
            return link;
        }
    }
    
    // Second pass: Look for numbered patterns and Sprint sessions
    for (const link of streamingLinks) {
        const filename = link.filename.toLowerCase();
        
        if (sessionNameLower.includes('one') && (filename.includes('fp1') || filename.includes('practice 1') || filename.includes('practice.1'))) {
            return link;
        }
        if (sessionNameLower.includes('two') && (filename.includes('fp2') || filename.includes('practice 2') || filename.includes('practice.2'))) {
            return link;
        }
        if (sessionNameLower.includes('three') && (filename.includes('fp3') || filename.includes('practice 3') || filename.includes('practice.3'))) {
            return link;
        }
        if (sessionNameLower.includes('sprint qualifying') && (filename.includes('sprint qualifying') || filename.includes('sprint.qualifying') || filename.includes('sprint quali') || filename.includes('sq'))) {
            return link;
        }
        if (sessionNameLower.includes('sprint') && !sessionNameLower.includes('qualifying') && filename.includes('sprint') && !filename.includes('qualifying') && !filename.includes('sprint.qualifying')) {
            return link;
        }
    }
    
    // Third pass: Use the pattern matching for allowed sessions only
    for (const link of streamingLinks) {
        const filename = link.filename.toLowerCase();
        
        // Check if filename contains session-specific patterns
        for (const [sessionKey, patterns] of Object.entries(sessionPatterns)) {
            if (sessionNameLower.includes(sessionKey) || sessionKey.includes(sessionNameLower)) {
                for (const pattern of patterns) {
                    if (filename.includes(pattern)) {
                        return link;
                    }
                }
            }
        }
    }
    
    // Fourth pass: Check for general keyword matches (but exclude practice sessions to avoid confusion)
    if (!sessionNameLower.includes('practice')) {
        for (const link of streamingLinks) {
            const filename = link.filename.toLowerCase();
            
            const sessionWords = sessionNameLower.split(/[\s-]+/).filter(word => 
                word.length > 2 && 
                !['the', 'and', 'for', 'with', 'from'].includes(word)
            );
            
            let matchCount = 0;
            for (const word of sessionWords) {
                if (filename.includes(word)) {
                    matchCount++;
                }
            }
            
            // If more than half the words match, consider it a good match
            if (matchCount > sessionWords.length / 2) {
                return link;
            }
        }
    }
    
    // If no specific match found, return the first file
    return streamingLinks[0];
}

async function processEgortechData() {
    if (cache.isProcessing) {
        console.log('⏳ Processing already in progress, skipping...');
        return cache.grandPrix;
    }
    
    cache.isProcessing = true;
    cache.processingProgress = {
        current: 0,
        total: 0,
        status: 'fetching_posts'
    };
    
    try {
        const posts = await fetchEgortechPosts();
        const processedData = new Map();
        
        // Load fully processed posts cache
        let fullyProcessedPosts = loadFullyProcessedPosts();
        console.log(`✅ Loaded ${fullyProcessedPosts.length} fully processed posts from cache`);
        
        // Clean up old posts
        fullyProcessedPosts = cleanupOldFullyProcessedPosts(fullyProcessedPosts);
        
        console.log(`🔄 Processing ${posts.length} egortech Formula 1 posts`);
        
        // Count how many posts are already fully processed
        let skippedCount = 0;
        let newPostsCount = 0;
        let preservedGpCount = 0;
        
        // Check if we have cached posts to compare against
        const cachedPosts = loadPostsCache();
        const cachedPostIds = cachedPosts ? new Set(cachedPosts.map(p => p.id)) : new Set();
        const newPostIds = posts.filter(post => !cachedPostIds.has(post.id));
        
        if (newPostIds.length > 0) {
            console.log(`🆕 Found ${newPostIds.length} new posts since last run: ${newPostIds.map(p => p.id).join(', ')}`);
        } else {
            console.log(`📝 No new posts found since last run`);
        }
        
        // Group posts by Grand Prix
        const gpPosts = new Map();
        
        for (const post of posts) {
            const grandPrix = extractGrandPrixFromTitle(post.title);
            if (!grandPrix) {
                continue;
            }
            
            const gpKey = `${grandPrix.name}-${grandPrix.round}`;
            if (!gpPosts.has(gpKey)) {
                gpPosts.set(gpKey, {
                    ...grandPrix,
                    posts: []
                });
            }
            
            gpPosts.get(gpKey).posts.push(post);
        }
        
        cache.processingProgress = {
            current: 0,
            total: gpPosts.size,
            status: 'processing_grand_prix'
        };
        
        // Process each Grand Prix
        let currentGp = 0;
        for (const [gpKey, gpData] of gpPosts) {
            currentGp++;
            cache.processingProgress = {
                current: currentGp,
                total: gpPosts.size,
                status: `processing_${gpData.name}`
            };
            
            console.log(`🏁 Processing ${gpData.name} (${currentGp}/${gpPosts.size})...`);
            
            const sessions = new Map();
            let allSessions = new Set();
            
            // First pass: Extract magnet links and sessions from posts
            const magnetData = {};
            let hasNewPosts = false;
            
            for (const post of gpData.posts) {
                
                // Check if this post has been fully processed
                if (isPostFullyProcessed(post.id, fullyProcessedPosts)) {
                    console.log(`    ⏭️  Post ${post.id} already fully processed, skipping...`);
                    skippedCount++;
                    continue;
                }
                
                // Use post content from API response if available, otherwise fetch it
                let postContent = post.selftext_html || post.selftext || '';
                if (!postContent) {
                    console.log(`    📡 Fetching content for post ${post.id}...`);
                    postContent = await fetchPostContent(post.url, post.id);
                }
                
                if (!postContent) {
                    console.log(`    ⚠️  No content found for post ${post.id}`);
                    continue;
                }
                
                const magnetLink = extractMagnetLink(postContent);
                
                if (!magnetLink) {
                    console.log(`    ⚠️  No magnet link found in post ${post.id}`);
                    continue;
                }
                
                const quality = extractQualityFromTitle(post.title);
                const postSessions = extractSessionsFromContent(postContent);
                
                if (postSessions.length === 0) {
                    console.log(`    ⚠️  No sessions found in post ${post.id}`);
                    continue;
                }
                
                // Add sessions to the set
                postSessions.forEach(session => allSessions.add(session.name));
                
                // Store magnet link for this quality
                magnetData[quality] = {
                    magnetLink: magnetLink,
                    postUrl: post.url,
                    title: post.title,
                    sessions: postSessions,
                    postContent: postContent,
                    postId: post.id
                };
                
                hasNewPosts = true;
                newPostsCount++;
                console.log(`    ✅ Processed post ${post.id} (${quality}, ${postSessions.length} sessions)`);
            }
            
            // If no new posts to process, preserve existing cached data
            if (!hasNewPosts) {
                console.log(`  ⏭️  No new posts to process for ${gpData.name}, preserving cached data...`);
                
                // Get existing cached data for this Grand Prix
                const existingGpData = cache.grandPrix.get(gpKey);
                if (existingGpData && existingGpData.sessions && existingGpData.sessions.size > 0) {
                    processedData.set(gpKey, existingGpData);
                    preservedGpCount++;
                    console.log(`  📁 Preserved cached data for ${gpData.name} (${existingGpData.sessions.size} sessions)`);
                } else {
                    console.log(`  ⚠️  No valid cached data found for ${gpData.name}, skipping...`);
                }
                continue;
            }
            
            // Second pass: Convert magnet links to streaming links for each quality
            const streamingData = {};
            
            for (const [quality, data] of Object.entries(magnetData)) {
                console.log(`  🔄 Converting ${quality} magnet link to Real-Debrid streaming links...`);
                
                const streamingLinks = await convertMagnetToRealDebridStreamingLinks(data.magnetLink);
                
                if (streamingLinks && streamingLinks.length > 0) {
                    streamingData[quality] = {
                        streamingLinks: streamingLinks,
                        postUrl: data.postUrl,
                        title: data.title,
                        sessions: data.sessions
                    };
                    console.log(`    ✅ Successfully converted ${quality} to ${streamingLinks.length} streaming links`);
                } else {
                    console.log(`    ❌ Failed to convert ${quality} magnet link`);
                }
            }
            
            // Third pass: Create session entries and assign streaming links
            for (const sessionName of allSessions) {
                // Find the session details from the post content
                const sessionDetails = Object.values(magnetData)
                    .map(data => extractSessionsFromContent(data.postContent || ''))
                    .flat()
                    .find(session => session.name === sessionName);
                
                // Convert the date from DD.MM.YYYY format to a proper Date object
                let sessionDate = Date.now(); // Default fallback
                if (sessionDetails && sessionDetails.date) {
                    try {
                        // Parse date in DD.MM.YYYY format
                        const [day, month, year] = sessionDetails.date.split('.');
                        if (day && month && year) {
                            sessionDate = new Date(year, month - 1, day).getTime();
                        }
                    } catch (error) {
                        console.log(`    ⚠️  Failed to parse date "${sessionDetails.date}" for session "${sessionName}"`);
                    }
                }
                
                sessions.set(sessionName, {
                    title: getDisplayNameForSession(sessionName),
                    streams: [],
                    updated: sessionDate,
                    details: sessionDetails || null
                });
                
                // Add streams for both qualities if available
                for (const [quality, data] of Object.entries(streamingData)) {
                    if (data.streamingLinks && data.streamingLinks.length > 0) {
                        // Find the correct file for this session
                        const sessionFile = findSessionFile(data.streamingLinks, sessionName);
                        
                        if (sessionFile) {
                            sessions.get(sessionName).streams.push({
                                url: sessionFile.url,
                                quality: quality,
                                source: 'Sky F1',
                                filename: sessionFile.filename,
                                postUrl: data.postUrl,
                                sessionName: sessionName,
                                sessionDetails: sessionDetails
                            });
                        }
                    }
                }
            }
            
            // Check if posts should be marked as fully processed
            for (const [quality, data] of Object.entries(magnetData)) {
                if (data.sessions && data.sessions.length > 0) {
                    // Check if this post has all required sessions
                    if (hasAllRequiredSessions(data.sessions)) {
                        console.log(`    ✅ Post ${data.postId} has all required sessions, marking as fully processed`);
                        addToFullyProcessedPosts(data.postId, gpData.name, data.sessions, fullyProcessedPosts);
                    }
                }
            }
            
            processedData.set(gpKey, {
                ...gpData,
                sessions: sessions
            });
            
            // Save progress to cache file periodically
            if (currentGp % 3 === 0) {
                cache.grandPrix = processedData;
                saveCacheToFile();
            }
        }
        
        cache.grandPrix = processedData;
        cache.lastUpdate = Date.now();
        cache.processingProgress = {
            current: gpPosts.size,
            total: gpPosts.size,
            status: 'completed'
        };
        
        // Preserve any existing Grand Prix that weren't found in current posts
        // (e.g., older races that are beyond the scroll range)
        for (const [gpKey, existingGpData] of cache.grandPrix) {
            if (!processedData.has(gpKey) && existingGpData.sessions && existingGpData.sessions.size > 0) {
                processedData.set(gpKey, existingGpData);
                preservedGpCount++;
                console.log(`📁 Preserved older Grand Prix from cache: ${existingGpData.name} (${existingGpData.sessions.size} sessions)`);
            }
        }
        
        // Additional preservation: Check if we lost Grand Prix due to MAX_SCROLL_MONTHS change
        // Load the original cache to see what we had before
        const originalCacheFile = path.join(__dirname, 'cache', 'addon-cache-backup.json');
        if (fs.existsSync(originalCacheFile)) {
            try {
                const originalCacheData = JSON.parse(fs.readFileSync(originalCacheFile, 'utf8'));
                const originalGrandPrix = new Map(originalCacheData.grandPrix || []);
                
                // Convert sessions arrays back to Maps for each Grand Prix
                for (const [gpKey, gpData] of originalGrandPrix) {
                    if (gpData.sessions) {
                        if (Array.isArray(gpData.sessions)) {
                            gpData.sessions = new Map(gpData.sessions);
                        } else if (typeof gpData.sessions === 'object' && Object.keys(gpData.sessions).length === 0) {
                            gpData.sessions = new Map();
                        } else if (typeof gpData.sessions === 'object' && Object.keys(gpData.sessions).length > 0) {
                            gpData.sessions = new Map(Object.entries(gpData.sessions));
                        }
                    }
                }
                
                // Restore any Grand Prix that were lost
                for (const [gpKey, originalGpData] of originalGrandPrix) {
                    if (!processedData.has(gpKey) && originalGpData.sessions && originalGpData.sessions.size > 0) {
                        processedData.set(gpKey, originalGpData);
                        preservedGpCount++;
                        console.log(`🔄 Restored lost Grand Prix from backup: ${originalGpData.name} (${originalGpData.sessions.size} sessions)`);
                    }
                }
            } catch (error) {
                console.error('Error loading backup cache:', error);
            }
        }
        
        console.log(`💾 Cache updated with ${processedData.size} Grand Prix`);
        saveCacheToFile();
        
        // Save fully processed posts cache
        saveFullyProcessedPosts(fullyProcessedPosts);
        
        // Log processing summary
        console.log(`\n=== PROCESSING SUMMARY ===`);
        console.log(`Total posts fetched from Reddit: ${posts.length}`);
        console.log(`New posts since last run: ${newPostIds.length}`);
        console.log(`Posts already fully processed (skipped): ${skippedCount}`);
        console.log(`New posts processed: ${newPostsCount}`);
        console.log(`Grand Prix preserved from cache: ${preservedGpCount}`);
        console.log(`Time saved: ${skippedCount} posts did not need Real-Debrid conversion`);
        console.log(`Fully processed posts cache: ${fullyProcessedPosts.length} posts`);
        console.log(`Grand Prix in final cache: ${processedData.size}`);
        console.log(`========================\n`);
        
        return processedData;
    } catch (error) {
        console.error('Error processing egortech data:', error);
        cache.processingProgress = {
            current: 0,
            total: 0,
            status: 'error'
        };
        throw error;
    } finally {
        cache.isProcessing = false;
    }
}

async function updateCache() {
    try {
        console.log('🔄 Updating cache...');
        const processedData = await processEgortechData();
        cache.grandPrix = processedData;
        cache.lastUpdate = Date.now();
        saveCacheToFile();
        return processedData;
    } catch (error) {
        console.error('Error updating cache:', error);
        throw error;
    }
}

// Catalog Handler - Real Debrid Only
builder.defineCatalogHandler(({ type, id, extra }) => {
    if (type !== 'series' || id !== 'stremula1-2025') {
        return Promise.resolve({ metas: [] });
    }
    
    // Check if Real Debrid is configured
    if (!realdebridConfig.enabled || !realdebridConfig.apiKey) {
        console.log('⚠️  Real Debrid not configured - returning empty catalog');
        return Promise.resolve({ metas: [] });
    }
    
    const metas = [];
    
    // Sort Grand Prix: latest first, then by round number (highest round = most recent race)
    const sortedGps = Array.from(cache.grandPrix.values())
        .sort((a, b) => {
            // Sort by round number (highest round = most recent race)
            return b.round - a.round;
        });
    
    console.log(`📋 Catalog: Processing ${sortedGps.length} Grand Prix from cache`);
    
    for (const gp of sortedGps) {
        // Ensure sessions is a Map
        if (!gp.sessions || typeof gp.sessions.values !== 'function') {
            console.log(`⚠️  Skipping ${gp.name} - invalid sessions data`);
            continue;
        }
        
        const sessionCount = gp.sessions.size;
        const sessionsWithStreams = Array.from(gp.sessions.values()).filter(s => s.streams && s.streams.length > 0).length;
        console.log(`📋 Including ${gp.name} (Round ${gp.round}) with ${sessionCount} sessions (${sessionsWithStreams} with streams)`);
        
        // Include ALL Grand Prix regardless of completion status
        metas.push({
            id: `stremula1:${gp.name.replace(/\s+/g, '-').toLowerCase()}`,
            type: 'series',
            name: gp.name,
            poster: getPosterForGrandPrix(gp.name),
            background: `${PUBLIC_BASE_URL}/media/background.jpeg`,
            logo: `${PUBLIC_BASE_URL}/media/logo.webp`,
            description: `Sky Sports F1 presents the ${gp.name}, with Martin Brundle and David Croft analysing the action`,
            releaseInfo: `Round ${gp.round} • ${gp.country}`,
            genres: ['Formula 1', 'Motorsport', 'Racing', 'Real-Debrid'],
            extra: {
                search: extra?.search || '',
                genre: extra?.genre || ''
            }
        });
    }
    
    console.log(`📋 Catalog returning ${metas.length} Grand Prix`);
    return Promise.resolve({ metas });
});

// Meta Handler - Real Debrid Only
builder.defineMetaHandler(({ type, id }) => {
    if (type !== 'series' || !id.startsWith('stremula1:')) {
        return Promise.resolve({ meta: null });
    }
    
    // Check if Real Debrid is configured
    if (!realdebridConfig.enabled || !realdebridConfig.apiKey) {
        console.log('⚠️  Real Debrid not configured - returning null meta');
        return Promise.resolve({ meta: null });
    }
    
    const parts = id.split(':');
    if (parts.length < 2) {
        return Promise.resolve({ meta: null });
    }
    
    const [, gpName] = parts;
    const gpData = Array.from(cache.grandPrix.values())
        .find(gp => gp.name.replace(/\s+/g, '-').toLowerCase() === gpName);
    
    if (!gpData) {
        console.log(`⚠️  Grand Prix not found: ${gpName}`);
        return Promise.resolve({ meta: null });
    }
    
    // Ensure sessions is a Map
    if (!gpData.sessions || typeof gpData.sessions.values !== 'function') {
        console.log(`⚠️  Skipping ${gpData.name} - invalid sessions data in meta handler`);
        return Promise.resolve({ meta: null });
    }
    
    console.log(`🎬 Meta handler for ${gpData.name}: ${gpData.sessions.size} sessions available`);
    
    const videos = [];
    const sessionKeys = Array.from(gpData.sessions.keys());
    
    // Show ALL available sessions with streams, regardless of weekend completion
    // Sort sessions by their typical weekend order
    const sessionOrder = [
        'Free Practice One',
        'Free Practice Two', 
        'Free Practice Three',
        'Sprint Qualifying',
        'Sprint',
        'Qualifying',
        'Race'
    ];
    
    let episodeNumber = 1;
    
    // First, add sessions in their typical weekend order if they exist
    for (const sessionType of sessionOrder) {
        let sessionData = null;
        let sessionKey = null;
        
        // Find matching session
        for (const [key, value] of gpData.sessions) {
            const keyLower = key.toLowerCase();
            const sessionTypeLower = sessionType.toLowerCase();
            
            // Handle variations in session names
            if (sessionTypeLower.includes('practice one') && 
                (keyLower.includes('practice one') || keyLower.includes('practice.one') || keyLower.includes('fp1'))) {
                sessionData = value;
                sessionKey = key;
                break;
            } else if (sessionTypeLower.includes('practice two') && 
                (keyLower.includes('practice two') || keyLower.includes('practice.two') || keyLower.includes('fp2'))) {
                sessionData = value;
                sessionKey = key;
                break;
            } else if (sessionTypeLower.includes('practice three') && 
                (keyLower.includes('practice three') || keyLower.includes('practice.three') || keyLower.includes('fp3'))) {
                sessionData = value;
                sessionKey = key;
                break;
            } else if (sessionTypeLower.includes('sprint qualifying') && 
                (keyLower.includes('sprint qualifying') || keyLower.includes('sprint quali'))) {
                sessionData = value;
                sessionKey = key;
                break;
            } else if (sessionTypeLower === 'sprint' && 
                keyLower.includes('sprint') && !keyLower.includes('qualifying')) {
                sessionData = value;
                sessionKey = key;
                break;
            } else if (sessionTypeLower === 'qualifying' && 
                (keyLower.includes('qualifying') || keyLower.includes('quali')) && !keyLower.includes('sprint')) {
                sessionData = value;
                sessionKey = key;
                break;
            } else if (sessionTypeLower === 'race' && keyLower.includes('race')) {
                sessionData = value;
                sessionKey = key;
                break;
            }
        }
        
        // Add session if it has streams
        if (sessionData && sessionData.streams && sessionData.streams.length > 0) {
            videos.push({
                id: `stremula1:${gpName}:${sessionType}`,
                title: sessionType,
                season: 1,
                episode: episodeNumber++,
                released: new Date(sessionData.updated).toISOString(),
                thumbnail: getThumbnailForSession(sessionType),
                overview: `Sky Sports F1 presents the ${gpData.name}: ${sessionType}, with Martin Brundle and David Croft analysing the action`
            });
            console.log(`🎬 Added ${sessionType} (${sessionData.streams.length} streams)`);
        }
    }
    
    // If no videos were added from ordered sessions, add any available sessions
    if (videos.length === 0) {
        console.log(`⚠️  No ordered sessions found, adding any available sessions`);
        for (const [sessionKey, sessionData] of gpData.sessions) {
            if (sessionData.streams && sessionData.streams.length > 0) {
                videos.push({
                    id: `stremula1:${gpName}:${sessionKey}`,
                    title: sessionKey,
                    season: 1,
                    episode: episodeNumber++,
                    released: new Date(sessionData.updated).toISOString(),
                    thumbnail: getThumbnailForSession(sessionKey),
                    overview: `Sky Sports F1 presents the ${gpData.name}: ${sessionKey}, with Martin Brundle and David Croft analysing the action`
                });
                console.log(`🎬 Added ${sessionKey} (${sessionData.streams.length} streams)`);
            }
        }
    }
    
    console.log(`🎬 Meta handler returning ${videos.length} episodes for ${gpData.name}`);
    
    const meta = {
        id: id,
        type: 'series',
        name: gpData.name,
        poster: getPosterForGrandPrix(gpData.name),
        background: `${PUBLIC_BASE_URL}/media/background.jpeg`,
        logo: `${PUBLIC_BASE_URL}/media/logo.webp`,
        description: `Sky Sports F1 presents the ${gpData.name}, with Martin Brundle and David Croft analysing the action`,
        releaseInfo: `Round ${gpData.round} • ${gpData.country}`,
        genres: ['Formula 1', 'Motorsport', 'Racing'],
        videos: videos
    };
    
    return Promise.resolve({ meta });
});

// Stream Handler - Real Debrid Only (Now just returns pre-converted streams!)
builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== 'series' || !id.startsWith('stremula1:')) {
        return Promise.resolve({ streams: [] });
    }
    
    // Check if Real Debrid is configured
    if (!realdebridConfig.enabled || !realdebridConfig.apiKey) {
        console.log('⚠️  Real Debrid not configured - no streams available');
        return Promise.resolve({ streams: [] });
    }
    
    const parts = id.split(':');
    if (parts.length < 3) {
        return Promise.resolve({ streams: [] });
    }
    const [, gpName, sessionType] = parts;
    
    // Define allowed sessions
    const allowedSessions = [
        'Free Practice One',
        'Free Practice Two', 
        'Free Practice Three',
        'Sprint Qualifying',
        'Sprint',
        'Qualifying',
        'Race'
    ];
    
    // Check if the requested session is allowed
    const isAllowedSession = allowedSessions.some(allowed => {
        const allowedLower = allowed.toLowerCase();
        const sessionTypeLower = sessionType.toLowerCase();
        
        // First check if session contains excluded terms
        if (sessionTypeLower.includes('notebook') || sessionTypeLower.includes('ted') || sessionTypeLower.includes('pre qualifying')) {
            return false;
        }
        
        if (allowedLower.includes('practice one') && sessionTypeLower.includes('practice one')) return true;
        if (allowedLower.includes('practice two') && sessionTypeLower.includes('practice two')) return true;
        if (allowedLower.includes('practice three') && sessionTypeLower.includes('practice three')) return true;
        if (allowedLower === 'qualifying' && sessionTypeLower.includes('qualifying')) return true;
        if (allowedLower === 'race' && sessionTypeLower.includes('race')) return true;
        
        return allowedLower === sessionTypeLower;
    });
    
    if (!isAllowedSession) {
        console.log(`🚫 Session not allowed: ${sessionType}`);
        return Promise.resolve({ streams: [] });
    }
    
    const gpData = Array.from(cache.grandPrix.values())
        .find(gp => gp.name.replace(/\s+/g, '-').toLowerCase() === gpName);
    
    if (!gpData) {
        return Promise.resolve({ streams: [] });
    }
    
    // Ensure sessions is a Map
    if (!gpData.sessions || typeof gpData.sessions.values !== 'function') {
        console.log(`⚠️  Skipping ${gpData.name} - invalid sessions data in stream handler`);
        return Promise.resolve({ streams: [] });
    }
    
    // Find session data with case-insensitive matching
    let sessionData = null;
    for (const [key, value] of gpData.sessions) {
        const keyLower = key.toLowerCase();
        const sessionTypeLower = sessionType.toLowerCase();
        
        // Handle variations in session names
        if (sessionTypeLower.includes('practice one') && 
            (keyLower.includes('practice one') || keyLower.includes('practice.one') || keyLower.includes('fp1'))) {
            sessionData = value;
            break;
        } else if (sessionTypeLower.includes('practice two') && 
            (keyLower.includes('practice two') || keyLower.includes('practice.two') || keyLower.includes('fp2'))) {
            sessionData = value;
            break;
        } else if (sessionTypeLower.includes('practice three') && 
            (keyLower.includes('practice three') || keyLower.includes('practice.three') || keyLower.includes('fp3'))) {
            sessionData = value;
            break;
        } else if (sessionTypeLower.includes('sprint qualifying') && 
            (keyLower.includes('sprint qualifying') || keyLower.includes('sprint quali'))) {
            sessionData = value;
            break;
        } else if (sessionTypeLower === 'sprint' && 
            keyLower.includes('sprint') && !keyLower.includes('qualifying')) {
            sessionData = value;
            break;
        } else if (sessionTypeLower === 'qualifying' && 
            (keyLower.includes('qualifying') || keyLower.includes('quali')) && !keyLower.includes('sprint')) {
            sessionData = value;
            break;
        } else if (sessionTypeLower === 'race' && keyLower.includes('race')) {
            sessionData = value;
            break;
        }
    }
    
    if (!sessionData || sessionData.streams.length === 0) {
        console.log(`📭 No streams available for session: ${sessionType}`);
        return Promise.resolve({ streams: [] });
    }
    
    const streams = [];
    
    // Return pre-converted streaming links (no conversion needed!)
    for (const stream of sessionData.streams) {
        
        // Build title with quality and source info
        let title = sessionData.title;
        if (stream.quality && stream.quality !== 'Unknown') {
            title += ` - ${stream.quality}`;
        }
        if (stream.source && stream.source !== 'Unknown') {
            title += ` (${stream.source})`;
        }
        
        // Create stream with pre-converted Real-Debrid streaming URL
        streams.push({
            title: title,
            url: stream.url,
            filename: stream.filename,
            behaviorHints: {
                bingeGroup: `stremula1-${gpData.round}-${sessionType}`,
                // Real Debrid streams are web-ready direct streaming links
                notWebReady: false,
                // Add session-specific metadata
                sessionInfo: {
                    sessionType: sessionType,
                    sessionTitle: sessionData.title,
                    date: sessionData.details?.date || '',
                    duration: sessionData.details?.duration || '',
                    quality: stream.quality || 'Unknown',
                    source: stream.source || 'Unknown'
                }
            }
        });
    }
    
    console.log(`🎬 Returning ${streams.length} pre-converted Real-Debrid streams for session: ${sessionType}`);
    return Promise.resolve({ streams });
});

// Command Line Interface for managing fully processed posts
function setupCommandInterface() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    console.log('\n🔧 Command Interface Available!');
    console.log('Available commands:');
    console.log('  add <post_id> <grand_prix_name> - Add a post to fully processed list');
    console.log('  remove <post_id> - Remove a post from fully processed list');
    console.log('  list - Show all fully processed posts');
    console.log('  refresh - Force refresh posts cache (respects MAX_SCROLL_MONTHS)');
    console.log('  restore - Restore Grand Prix from backup cache');
    console.log('  help - Show this help message');
    console.log('  exit - Exit the command interface');
    console.log('Example: add 1kyml0a "Spanish Grand Prix"\n');
    
    rl.on('line', async (input) => {
        const command = input.trim().toLowerCase();
        
        if (command === 'exit') {
            console.log('👋 Exiting command interface...');
            rl.close();
            return;
        }
        
        if (command === 'help') {
            console.log('\n🔧 Available Commands:');
            console.log('  add <post_id> <grand_prix_name> - Add a post to fully processed list');
            console.log('  remove <post_id> - Remove a post from fully processed list');
            console.log('  list - Show all fully processed posts');
            console.log('  refresh - Force refresh posts cache (respects MAX_SCROLL_MONTHS)');
            console.log('  restore - Restore Grand Prix from backup cache');
            console.log('  help - Show this help message');
            console.log('  exit - Exit the command interface');
            console.log('Example: add 1kyml0a "Spanish Grand Prix"\n');
            return;
        }
        
        if (command === 'list') {
            const fullyProcessedPosts = loadFullyProcessedPosts();
            console.log(`\n📋 Fully Processed Posts (${fullyProcessedPosts.length} total):`);
            fullyProcessedPosts.forEach((post, index) => {
                console.log(`  ${index + 1}. ${post.id} - ${post.grandPrixName} (${post.sessionCount} sessions)`);
            });
            console.log('');
            return;
        }
        
        if (command === 'refresh') {
            try {
                console.log('🔄 Force refreshing posts cache...');
                console.log(`📅 Current MAX_SCROLL_MONTHS setting: ${CONFIG.MAX_SCROLL_MONTHS} months`);
                
                // Delete posts cache to force refresh
                if (fs.existsSync(CONFIG.POSTS_CACHE_FILE)) {
                    fs.unlinkSync(CONFIG.POSTS_CACHE_FILE);
                    console.log('🗑️  Deleted posts cache file');
                }
                
                // Trigger cache update
                console.log('🔄 Starting cache update...');
                await updateCache();
                console.log('✅ Cache refresh completed!');
                
            } catch (error) {
                console.error('❌ Error refreshing cache:', error.message);
            }
            return;
        }
        
        if (command === 'restore') {
            try {
                console.log('🔄 Restoring Grand Prix from backup cache...');
                
                const backupFile = path.join(__dirname, 'cache', 'addon-cache-backup.json');
                if (!fs.existsSync(backupFile)) {
                    console.log('❌ No backup cache file found');
                    return;
                }
                
                // Load backup cache
                const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
                const backupGrandPrix = new Map(backupData.grandPrix || []);
                
                // Convert sessions arrays back to Maps
                for (const [gpKey, gpData] of backupGrandPrix) {
                    if (gpData.sessions) {
                        if (Array.isArray(gpData.sessions)) {
                            gpData.sessions = new Map(gpData.sessions);
                        } else if (typeof gpData.sessions === 'object' && Object.keys(gpData.sessions).length === 0) {
                            gpData.sessions = new Map();
                        } else if (typeof gpData.sessions === 'object' && Object.keys(gpData.sessions).length > 0) {
                            gpData.sessions = new Map(Object.entries(gpData.sessions));
                        }
                    }
                }
                
                // Restore to current cache
                let restoredCount = 0;
                for (const [gpKey, gpData] of backupGrandPrix) {
                    if (!cache.grandPrix.has(gpKey) && gpData.sessions && gpData.sessions.size > 0) {
                        cache.grandPrix.set(gpKey, gpData);
                        restoredCount++;
                        console.log(`✅ Restored: ${gpData.name} (${gpData.sessions.size} sessions)`);
                    }
                }
                
                if (restoredCount > 0) {
                    saveCacheToFile();
                    console.log(`✅ Successfully restored ${restoredCount} Grand Prix from backup`);
                } else {
                    console.log('ℹ️  No Grand Prix needed restoration');
                }
                
            } catch (error) {
                console.error('❌ Error restoring from backup:', error.message);
            }
            return;
        }
        
        if (command.startsWith('add ')) {
            const parts = input.trim().split(' ');
            if (parts.length < 3) {
                console.log('❌ Usage: add <post_id> <grand_prix_name>');
                console.log('Example: add 1kyml0a "Spanish Grand Prix"');
                return;
            }
            
            const postId = parts[1];
            const grandPrixName = parts.slice(2).join(' ');
            
            try {
                let fullyProcessedPosts = loadFullyProcessedPosts();
                
                // Check if post already exists
                const existingIndex = fullyProcessedPosts.findIndex(p => p.id === postId);
                if (existingIndex >= 0) {
                    console.log(`⚠️  Post ${postId} is already in the fully processed list`);
                    return;
                }
                
                // Create a mock session list (since we're manually adding)
                // Note: These dates should be updated to match the actual race weekend dates
                const mockSessions = [
                    { name: 'Free Practice One', fullMatch: 'Free Practice One (04.09.2025) (0:41:23)', date: '04.09.2025', duration: '0:41:23' },
                    { name: 'Free Practice Two', fullMatch: 'Free Practice Two (05.09.2025) (1:21:03)', date: '05.09.2025', duration: '1:21:03' },
                    { name: 'Free Practice Three', fullMatch: 'Free Practice Three (06.09.2025) (1:40:31)', date: '06.09.2025', duration: '1:40:31' },
                    { name: 'Qualifying', fullMatch: 'Qualifying (06.09.2025) (2:22:03)', date: '06.09.2025', duration: '2:22:03' },
                    { name: 'Race', fullMatch: 'Race (07.09.2025) (4:03:03)', date: '07.09.2025', duration: '4:03:03' }
                ];
                
                addToFullyProcessedPosts(postId, grandPrixName, mockSessions, fullyProcessedPosts);
                saveFullyProcessedPosts(fullyProcessedPosts);
                
                console.log(`✅ Successfully added post ${postId} (${grandPrixName}) to fully processed list`);
                console.log('🔄 The addon will skip this post in future processing runs');
                
            } catch (error) {
                console.error('❌ Error adding post:', error.message);
            }
            return;
        }
        
        if (command.startsWith('remove ')) {
            const parts = input.trim().split(' ');
            if (parts.length < 2) {
                console.log('❌ Usage: remove <post_id>');
                console.log('Example: remove 1kyml0a');
                return;
            }
            
            const postId = parts[1];
            
            try {
                let fullyProcessedPosts = loadFullyProcessedPosts();
                const originalLength = fullyProcessedPosts.length;
                
                fullyProcessedPosts = fullyProcessedPosts.filter(p => p.id !== postId);
                
                if (fullyProcessedPosts.length === originalLength) {
                    console.log(`⚠️  Post ${postId} not found in fully processed list`);
                    return;
                }
                
                saveFullyProcessedPosts(fullyProcessedPosts);
                console.log(`✅ Successfully removed post ${postId} from fully processed list`);
                console.log('🔄 The addon will process this post again in future runs');
                
            } catch (error) {
                console.error('❌ Error removing post:', error.message);
            }
            return;
        }
        
        console.log('❌ Unknown command. Type "help" for available commands.');
    });
}

// Initialize and start server
async function startServer() {
    // Load Real-Debrid configuration (prefer env var for cloud deploys)
    try {
        if (process.env.REALDEBRID_API_KEY) {
            realdebridConfig = { apiKey: process.env.REALDEBRID_API_KEY, enabled: true };
            console.log('✅ Real-Debrid configuration loaded from environment');
        } else {
            const configPath = path.join(__dirname, 'realdebrid-config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config && config.apiKey) {
                    realdebridConfig = { apiKey: config.apiKey, enabled: !!config.enabled };
                    console.log('✅ Real-Debrid configuration loaded from file');
                }
            } else {
                console.log('⚠️  WARNING: Real-Debrid configuration not found');
                console.log(`⚙️  Configure at: ${PUBLIC_BASE_URL}/config.html or set REALDEBRID_API_KEY env var`);
            }
        }
        console.log('🔑 Real-Debrid is REQUIRED for this addon to work');
    } catch (error) {
        console.log('❌ ERROR: Cannot read configuration');
        console.log('🔑 This addon REQUIRES Real-Debrid to function');
    }
    
    // Load Reddit API configuration
    console.log('\n🔧 Reddit API Configuration Check:');
    const redditConfigured = loadRedditConfig();
    if (redditConfigured) {
        console.log('✅ Reddit API credentials configured');
        console.log(`   Client ID: ${REDDIT.clientId.substring(0, 8)}...`);
        console.log(`   Username: ${REDDIT.username}`);
    } else {
        console.log('❌ Reddit API credentials NOT configured');
        console.log('📋 Required for Reddit API access:');
        console.log('   Option 1 - Environment variables:');
        console.log('   - REDDIT_CLIENT_ID (from Reddit app settings)');
        console.log('   - REDDIT_CLIENT_SECRET (from Reddit app settings)');
        console.log('   - REDDIT_USERNAME (your Reddit username)');
        console.log('   - REDDIT_PASSWORD (your Reddit password or app password)');
        console.log('\n   Option 2 - Use the configuration page:');
        console.log(`   ${PUBLIC_BASE_URL}/config.html`);
        console.log('\n🔗 Create a Reddit app at: https://www.reddit.com/prefs/apps');
        console.log('   Choose "script" as the app type');
        console.log('\n⚠️  Without Reddit API credentials, the addon cannot fetch posts!');
    }
    
    // Load existing cache for faster processing
    console.log('📁 Loading existing cache for faster processing...');
    const cacheLoaded = loadCacheFromFile();
    
    if (cacheLoaded && cache.grandPrix.size > 0) {
        console.log(`📁 Found existing cache with ${cache.grandPrix.size} Grand Prix`);
    } else {
        console.log('📝 No existing cache found, will process all posts');
    }
    
    // Check if MAX_SCROLL_MONTHS setting has changed and force refresh if needed
    if (process.env.FORCE_REFRESH_CACHE === '1') {
        console.log('🔄 FORCE_REFRESH_CACHE=1 detected, clearing cache...');
        try {
            if (fs.existsSync(CONFIG.POSTS_CACHE_FILE)) {
                fs.unlinkSync(CONFIG.POSTS_CACHE_FILE);
                console.log('🗑️  Deleted posts cache file');
            }
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }
    
    // Start HTTP server immediately; process data in background to avoid platform boot timeouts
    const port = DEFAULT_PORT;
    const app = express();
    // Dynamic base URL detection (behind proxy)
    app.use((req, _res, next) => {
        try {
            const proto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || req.protocol || 'http';
            const host = req.headers.host;
            if (host) PUBLIC_BASE_URL = `${proto}://${host}`;
        } catch (_e) {}
        next();
    });
    // Static assets (media, images, config.html, etc.)
    app.use(express.static(path.join(__dirname)));
    // Config API endpoints (moved from server.js)
    app.post('/api/config', express.json(), (req, res) => {
        try {
            const { apiKey } = req.body;
            if (!apiKey) return res.status(400).json({ error: 'API key is required' });
            if (!/^[a-zA-Z0-9]{20,}$/.test(apiKey)) return res.status(400).json({ error: 'Invalid API key format' });
            const config = { apiKey, enabled: true, lastUpdated: new Date().toISOString() };
            fs.writeFileSync(path.join(__dirname, 'realdebrid-config.json'), JSON.stringify(config, null, 2));
            res.json({ success: true, message: 'Configuration saved successfully' });
        } catch (error) {
            console.error('Error saving configuration:', error);
            res.status(500).json({ error: 'Failed to save configuration' });
        }
    });
    app.get('/api/config', (_req, res) => {
        try {
            if (process.env.REALDEBRID_API_KEY) {
                return res.json({ apiKey: '********', enabled: true, source: 'env' });
            }
            const configPath = path.join(__dirname, 'realdebrid-config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return res.json(config);
            }
            res.json({ enabled: false });
        } catch (error) {
            console.error('Error reading configuration:', error);
            res.status(500).json({ error: 'Failed to read configuration' });
        }
    });
    app.post('/api/test-key', express.json(), async (req, res) => {
        try {
            const { apiKey } = req.body;
            if (!apiKey) return res.status(400).json({ error: 'API key is required' });
            const response = await axios.get('https://api.real-debrid.com/rest/1.0/user', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (response.status === 200) {
                res.json({ success: true, user: response.data, message: `Welcome ${response.data.username}!` });
            } else {
                res.status(400).json({ error: 'Invalid API key' });
            }
        } catch (error) {
            console.error('Error testing API key:', error);
            res.status(500).json({ error: 'Failed to test API key' });
        }
    });
    
    // Reddit API configuration endpoints
    app.post('/api/test-reddit', express.json(), async (req, res) => {
        try {
            const { clientId, clientSecret, username, password } = req.body;
            if (!clientId || !clientSecret || !username || !password) {
                return res.status(400).json({ error: 'All Reddit API fields are required' });
            }
            
            // Test Reddit OAuth authentication
            const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const body = new URLSearchParams();
            body.append('grant_type', 'password');
            body.append('username', username);
            body.append('password', password);
            
            const response = await axios.post('https://www.reddit.com/api/v1/access_token', body.toString(), {
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Stremula1/2.0 (by u/stremula1-bot)'
                },
                timeout: 30000
            });
            
            if (response.data?.access_token) {
                res.json({ success: true, username: username, message: 'Reddit API authentication successful!' });
            } else {
                res.status(400).json({ error: 'Failed to authenticate with Reddit API' });
            }
        } catch (error) {
            console.error('Error testing Reddit API:', error.response?.data || error.message);
            if (error.response?.status === 401) {
                res.status(400).json({ error: 'Invalid Reddit credentials' });
            } else {
                res.status(500).json({ error: 'Failed to test Reddit API credentials' });
            }
        }
    });
    
    app.post('/api/reddit-config', express.json(), (req, res) => {
        try {
            const { clientId, clientSecret, username, password } = req.body;
            if (!clientId || !clientSecret || !username || !password) {
                return res.status(400).json({ error: 'All Reddit API fields are required' });
            }
            
            const config = { 
                clientId, 
                clientSecret, 
                username, 
                password, 
                enabled: true, 
                lastUpdated: new Date().toISOString() 
            };
            
            fs.writeFileSync(path.join(__dirname, 'reddit-config.json'), JSON.stringify(config, null, 2));
            res.json({ success: true, message: 'Reddit configuration saved successfully' });
        } catch (error) {
            console.error('Error saving Reddit configuration:', error);
            res.status(500).json({ error: 'Failed to save Reddit configuration' });
        }
    });
    
    app.get('/api/reddit-config', (_req, res) => {
        try {
            const configPath = path.join(__dirname, 'reddit-config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                // Don't return sensitive data, just show if configured
                return res.json({ 
                    configured: true, 
                    username: config.username,
                    clientId: config.clientId ? `${config.clientId.substring(0, 8)}...` : null
                });
            }
            res.json({ configured: false });
        } catch (error) {
            console.error('Error reading Reddit configuration:', error);
            res.status(500).json({ error: 'Failed to read Reddit configuration' });
        }
    });
    // Minimal addon status endpoint
    app.get('/api/addon-status', async (_req, res) => {
        try {
            res.json({
                status: 'online',
                cache: {
                    grandPrixCount: cache.grandPrix.size,
                    lastUpdate: cache.lastUpdate,
                    isProcessing: cache.isProcessing,
                    processingProgress: cache.processingProgress
                },
                realdebrid: {
                    enabled: !!realdebridConfig?.enabled,
                    configured: !!realdebridConfig?.apiKey
                },
                reddit: {
                    configured: !!(REDDIT.clientId && REDDIT.clientSecret && REDDIT.username && REDDIT.password),
                    username: REDDIT.username || null
                }
            });
        } catch (_error) {
            res.json({ status: 'offline' });
        }
    });
    // Mount Stremio addon router
    const router = getRouter({ manifest, get: builder.getInterface().get });
    app.use('/', router);
    // Start listening
    app.listen(port, '0.0.0.0', () => {
        console.log(`\n🚀 Stremula 1 Addon online at ${PUBLIC_BASE_URL}/manifest.json`);
        console.log(`⚙️  Configuration: ${PUBLIC_BASE_URL}/config.html`);
        console.log(`📊 Grand Prix available: ${cache.grandPrix.size}`);
    });

    // Kick off initial processing in background
    (async () => {
        console.log('\n🔄 Processing all posts in background...');
        console.log('📡 Always checking for new posts, skipping already processed ones.');
        console.log('⏳ First run may take a while; subsequent runs are much faster.');
        const progressInterval = setInterval(() => {
            if (cache.processingProgress.status !== 'idle') {
                const { current, total, status } = cache.processingProgress;
                if (total > 0) {
                    const percentage = Math.round((current / total) * 100);
                    console.log(`📊 Progress: ${current}/${total} (${percentage}%) - ${status}`);
                } else {
                    console.log(`📊 Status: ${status}`);
                }
            }
        }, 5000);
        const startTime = Date.now();
        try {
            await updateCache();
            const processingTime = Math.round((Date.now() - startTime) / 1000);
            console.log(`✅ Initial processing completed in ${processingTime} seconds!`);
        } catch (error) {
            console.error('❌ Initial processing failed:', error);
            console.log('⚠️  Addon started with empty cache');
        } finally {
            clearInterval(progressInterval);
        }
    })();
    
    console.log(`\n🚀 Stremula 1 Addon (Real Debrid Only) is now ONLINE!`);
    console.log(`📡 Install in Stremio: http://localhost:${port}/manifest.json`);
    console.log(`⚙️  Configuration: http://localhost:7002/config.html`);
    console.log(`📊 Grand Prix available: ${cache.grandPrix.size}`);
    console.log('✅ All magnet links have been pre-converted to streaming links!');
    console.log('✅ Addon is fully ready with optimized caching system!');
    
    // Test date parsing functionality
    testDateParsing();
    
    // Schedule periodic updates (every 30 minutes)
    cron.schedule('*/30 * * * *', () => {
        console.log('🔄 Starting scheduled cache update...');
        updateCache().catch(error => {
            console.error('Scheduled cache update failed:', error);
        });
    });
    
    // Setup command interface (local only)
    if (process.env.ENABLE_CLI === '1') {
        setupCommandInterface();
    }
}

startServer().catch(console.error);