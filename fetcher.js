const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');
const db = require('./database');

// Grand Prix data structure with alternative names
const GRAND_PRIX_2025 = [
    { name: 'Bahrain Grand Prix', round: 1, country: 'Bahrain', aliases: ['Bahrain GP'] },
    { name: 'Saudi Arabian Grand Prix', round: 2, country: 'Saudi Arabia', aliases: ['Saudi Arabia Grand Prix', 'Saudi GP', 'Jeddah Grand Prix', 'Jeddah GP'] },
    { name: 'Australian Grand Prix', round: 3, country: 'Australia', aliases: ['Australia Grand Prix', 'Australia GP', 'Melbourne Grand Prix', 'Melbourne GP'] },
    { name: 'Japanese Grand Prix', round: 4, country: 'Japan', aliases: ['Japan Grand Prix', 'Japan GP', 'Suzuka Grand Prix', 'Suzuka GP'] },
    { name: 'Chinese Grand Prix', round: 5, country: 'China', aliases: ['China Grand Prix', 'China GP', 'Shanghai Grand Prix', 'Shanghai GP'] },
    { name: 'Miami Grand Prix', round: 6, country: 'United States', aliases: ['Miami GP'] },
    { name: 'Emilia Romagna Grand Prix', round: 7, country: 'Italy', aliases: ['Emilia Romagna GP', 'Imola Grand Prix', 'Imola GP', 'San Marino Grand Prix', 'San Marino GP'] },
    { name: 'Monaco Grand Prix', round: 8, country: 'Monaco', aliases: ['Monaco GP'] },
    { name: 'Spanish Grand Prix', round: 9, country: 'Spain', aliases: ['Spain Grand Prix', 'Spain GP', 'Barcelona Grand Prix', 'Barcelona GP'] },
    { name: 'Canadian Grand Prix', round: 10, country: 'Canada', aliases: ['Canada Grand Prix', 'Canada GP', 'Montreal Grand Prix', 'Montreal GP'] },
    { name: 'Austrian Grand Prix', round: 11, country: 'Austria', aliases: ['Austria Grand Prix', 'Austria GP', 'Red Bull Ring Grand Prix', 'Red Bull Ring GP'] },
    { name: 'British Grand Prix', round: 12, country: 'United Kingdom', aliases: ['UK Grand Prix', 'UK GP', 'United Kingdom Grand Prix', 'United Kingdom GP', 'Silverstone Grand Prix', 'Silverstone GP', 'British GP'] },
    { name: 'Hungarian Grand Prix', round: 13, country: 'Hungary', aliases: ['Hungary Grand Prix', 'Hungary GP', 'Budapest Grand Prix', 'Budapest GP'] },
    { name: 'Belgian Grand Prix', round: 14, country: 'Belgium', aliases: ['Belgium Grand Prix', 'Belgium GP', 'Spa Grand Prix', 'Spa GP', 'Spa-Francorchamps Grand Prix', 'Spa-Francorchamps GP'] },
    { name: 'Dutch Grand Prix', round: 15, country: 'Netherlands', aliases: ['Netherlands Grand Prix', 'Netherlands GP', 'Zandvoort Grand Prix', 'Zandvoort GP', 'Dutch GP'] },
    { name: 'Italian Grand Prix', round: 16, country: 'Italy', aliases: ['Italy Grand Prix', 'Italy GP', 'Monza Grand Prix', 'Monza GP', 'Italian GP'] },
    { name: 'Azerbaijan Grand Prix', round: 17, country: 'Azerbaijan', aliases: ['Azerbaijan GP', 'Baku Grand Prix', 'Baku GP'] },
    { name: 'Singapore Grand Prix', round: 18, country: 'Singapore', aliases: ['Singapore GP'] },
    { name: 'United States Grand Prix', round: 19, country: 'United States', aliases: ['US Grand Prix', 'US GP', 'USA Grand Prix', 'USA GP', 'Austin Grand Prix', 'Austin GP', 'United States GP'] },
    { name: 'Mexican Grand Prix', round: 20, country: 'Mexico', aliases: ['Mexico Grand Prix', 'Mexico GP', 'Mexican States Grand Prix', 'Mexican GP'] },
    { name: 'Brazilian Grand Prix', round: 21, country: 'Brazil', aliases: ['Brazil Grand Prix', 'Brazil GP', 'Sao Paulo Grand Prix', 'Sao Paulo GP', 'São Paulo Grand Prix', 'São Paulo GP', 'Brazilian GP'] },
    { name: 'Las Vegas Grand Prix', round: 22, country: 'United States', aliases: ['Las Vegas GP', 'Vegas Grand Prix', 'Vegas GP'] },
    { name: 'Qatar Grand Prix', round: 23, country: 'Qatar', aliases: ['Qatar GP'] },
    { name: 'Abu Dhabi Grand Prix', round: 24, country: 'United Arab Emirates', aliases: ['Abu Dhabi GP', 'UAE Grand Prix', 'UAE GP', 'Yas Marina Grand Prix', 'Yas Marina GP'] }
];

// Reddit OAuth token cache
let redditAuth = { token: null, expiresAt: 0 };

// Get Reddit OAuth token
async function getRedditOAuthToken() {
    const config = getConfig();
    
    if (!config.reddit.clientId || !config.reddit.clientSecret || 
        !config.reddit.username || !config.reddit.password) {
        console.log('⚠️  Reddit OAuth credentials not configured');
        return null;
    }
    
    // Check if token is still valid (with 5 minute buffer)
    if (redditAuth.token && Date.now() < (redditAuth.expiresAt - 5 * 60 * 1000)) {
        return redditAuth.token;
    }
    
    console.log('🔐 Authenticating with Reddit API...');
    
    try {
        const authHeader = Buffer.from(`${config.reddit.clientId}:${config.reddit.clientSecret}`).toString('base64');
        const body = new URLSearchParams();
        body.append('grant_type', 'password');
        body.append('username', config.reddit.username);
        body.append('password', config.reddit.password);
        
        const response = await axios.post('https://www.reddit.com/api/v1/access_token', body.toString(), {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': config.reddit.userAgent
            },
            timeout: 30000
        });
        
        const accessToken = response.data?.access_token;
        const expiresIn = response.data?.expires_in || 3600;
        
        if (accessToken) {
            redditAuth.token = accessToken;
            redditAuth.expiresAt = Date.now() + (expiresIn * 1000);
            console.log('✅ Reddit OAuth authentication successful');
            return accessToken;
        }
        
        return null;
    } catch (error) {
        console.error('❌ Reddit OAuth authentication failed:', error.response?.status, error.response?.statusText);
        return null;
    }
}

// Extract year from title (e.g., "Formula 1 2026" or "2026 Formula 1")
function extractYearFromTitle(title) {
    // Look for 4-digit year (2024, 2025, 2026, etc.)
    const yearMatch = title.match(/\b(20\d{2})\b/);
    if (yearMatch) {
        return parseInt(yearMatch[1]);
    }
    // Default to current year if not found
    return new Date().getFullYear();
}

// Extract Grand Prix from title
function extractGrandPrixFromTitle(title) {
    const titleLower = title.toLowerCase();
    const roundMatch = title.match(/R(\d+)/i);
    const extractedRound = roundMatch ? parseInt(roundMatch[1]) : null;
    
    for (const gp of GRAND_PRIX_2025) {
        const gpNameLower = gp.name.toLowerCase();
        const gpShortName = gpNameLower.replace(' grand prix', '');
        
        // Check main name
        if (titleLower.includes(gpNameLower) || 
            titleLower.includes(gpShortName) ||
            titleLower.includes(gpShortName.replace(' ', ''))) {
            return {
                ...gp,
                round: extractedRound || gp.round
            };
        }
        
        // Check alternative names/aliases
        if (gp.aliases && gp.aliases.length > 0) {
            for (const alias of gp.aliases) {
                const aliasLower = alias.toLowerCase();
                const aliasShort = aliasLower.replace(' grand prix', '').replace(' gp', '');
                
                if (titleLower.includes(aliasLower) || 
                    titleLower.includes(aliasShort) ||
                    titleLower.includes(aliasShort.replace(' ', ''))) {
                    return {
                        ...gp,
                        round: extractedRound || gp.round
                    };
                }
            }
        }
    }
    return null;
}

// Extract quality from title
function extractQualityFromTitle(title) {
    if (title.includes('4K') || title.includes('2160p') || title.includes('UHD')) return '4K';
    if (title.includes('1080p') || title.includes('FHD') || title.includes('SkyF1HD')) return '1080p';
    return 'Unknown';
}

// Extract magnet link from HTML
function extractMagnetLink(html) {
    const $ = cheerio.load(html);
    
    const hrefLinks = [];
    $('a[href^="magnet:"]').each(function() {
        hrefLinks.push($(this).attr('href'));
    });
    
    if (hrefLinks.length > 0) {
        return hrefLinks[0];
    }
    
    const textContent = $.text();
    const magnetMatches = textContent.match(/magnet:\?[^\s]+/g);
    
    if (magnetMatches && magnetMatches.length > 0) {
        let magnetLink = magnetMatches[0];
        magnetLink = magnetLink.replace(/<\/[^>]*>.*$/, '');
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

// Extract sessions from content
function extractSessionsFromContent(html) {
    const $ = cheerio.load(html);
    const sessions = [];
    
    const allowedSessions = [
        'Free Practice One',
        'Free Practice Two', 
        'Free Practice Three',
        'Sprint Qualifying',
        'Sprint',
        'Qualifying',
        'Race'
    ];
    
    const textContent = $('body').text();
    
    let containsSection = '';
    const containsMatch1 = textContent.match(/Contains:[\s\S]*?(?=\n\n|\n[A-Z]|$)/i);
    if (containsMatch1) {
        containsSection = containsMatch1[0];
    }
    
    if (!containsSection || containsSection.length < 50) {
        const containsMatch2 = textContent.match(/Contains:[\s\S]*?(?=magnet:|Torrent Link|$)/i);
        if (containsMatch2) {
            containsSection = containsMatch2[0];
        }
    }
    
    if (!containsSection || containsSection.length < 50) {
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
    
    sessionLines.forEach(line => {
        let cleanLine = line
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .trim();
        
        const match = cleanLine.match(/^(.+?)\s*\(([^)]+)\)\s*\(([^)]+)\)$/);
        if (match) {
            const sessionName = match[1].trim();
            const date = match[2].trim();
            const duration = match[3].trim();
            
            const isAllowed = allowedSessions.some(allowedSession => {
                const sessionNameLower = sessionName.toLowerCase();
                const allowedLower = allowedSession.toLowerCase();
                
                if (sessionNameLower.includes('notebook') || sessionNameLower.includes('ted') || sessionNameLower.includes('pre qualifying')) {
                    return false;
                }
                
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
                    return sessionNameLower.includes('sprint') && 
                           !sessionNameLower.includes('qualifying') && 
                           !sessionNameLower.includes('race');
                } else if (allowedLower === 'qualifying') {
                    return (sessionNameLower.includes('qualifying') || sessionNameLower.includes('quali')) && 
                           !sessionNameLower.includes('sprint');
                } else if (allowedLower === 'race') {
                    return sessionNameLower.includes('race') && 
                           !sessionNameLower.includes('sprint');
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
            }
        }
    });
    
    return sessions;
}

// Check if all required sessions are present
function hasAllRequiredSessions(sessions) {
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
    
    let requiredSessions;
    if (hasSprintQualifying && hasSprint) {
        requiredSessions = [
            'Free Practice One',
            'Sprint Qualifying',
            'Sprint',
            'Qualifying',
            'Race'
        ];
    } else if (hasPractice2 && hasPractice3) {
        requiredSessions = [
            'Free Practice One',
            'Free Practice Two', 
            'Free Practice Three',
            'Qualifying',
            'Race'
        ];
    } else {
        requiredSessions = [
            'Free Practice One',
            'Free Practice Two', 
            'Free Practice Three',
            'Qualifying',
            'Race'
        ];
    }
    
    for (const requiredSession of requiredSessions) {
        const found = sessionNames.some(sessionName => {
            const sessionNameLower = sessionName.toLowerCase();
            const requiredLower = requiredSession.toLowerCase();
            
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
                sessionNameLower.includes('sprint') && 
                !sessionNameLower.includes('qualifying') && 
                !sessionNameLower.includes('race')) {
                return true;
            } else if (requiredLower === 'qualifying' && 
                (sessionNameLower.includes('qualifying') || sessionNameLower.includes('quali')) && !sessionNameLower.includes('sprint')) {
                return true;
            } else if (requiredLower === 'race' && 
                sessionNameLower.includes('race') && 
                !sessionNameLower.includes('sprint')) {
                return true;
            }
            
            return false;
        });
        
        if (!found) {
            return false;
        }
    }
    
    return true;
}

// Find session file in streaming links
function findSessionFile(streamingLinks, sessionName) {
    const sessionNameLower = sessionName.toLowerCase();
    
    for (const link of streamingLinks) {
        const filename = link.filename.toLowerCase();
        
        if (sessionNameLower.includes('sprint qualifying') || sessionNameLower.includes('sprint quali')) {
            if (filename.includes('sprint qualifying') || filename.includes('sprint.qualifying') || 
                filename.includes('sprint quali') || filename.includes('sq')) {
                return link;
            }
        }
        
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
        if (sessionNameLower === 'sprint' || (sessionNameLower.includes('sprint') && !sessionNameLower.includes('qualifying') && !sessionNameLower.includes('race'))) {
            if (filename.includes('sprint') && 
                !filename.includes('qualifying') && 
                !filename.includes('sprint.qualifying') &&
                !filename.includes('race')) {
                return link;
            }
        }
    }
    
    if (sessionNameLower === 'qualifying' || (sessionNameLower.includes('qualifying') && !sessionNameLower.includes('sprint'))) {
        for (const link of streamingLinks) {
            const filename = link.filename.toLowerCase();
            if ((filename.includes('qualifying') || filename.includes('quali')) && 
                !filename.includes('sprint qualifying') && 
                !filename.includes('sprint.qualifying') &&
                !filename.includes('sprint quali')) {
                return link;
            }
        }
    }
    
    if (sessionNameLower.includes('race') && !sessionNameLower.includes('sprint')) {
        for (const link of streamingLinks) {
            const filename = link.filename.toLowerCase();
            if (filename.includes('race') && !filename.includes('sprint')) {
                return link;
            }
        }
    }
    
    return streamingLinks[0];
}

// Real Debrid API functions
const REALDEBRID_API_URL = 'https://api.real-debrid.com/rest/1.0';

async function checkExistingTorrent(magnetLink, apiKey) {
    try {
        const response = await axios.get(`${REALDEBRID_API_URL}/torrents`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        const torrents = response.data;
        for (const torrent of torrents) {
            if (torrent.magnet === magnetLink) {
                return torrent;
            }
        }
        return null;
    } catch (error) {
        console.error('Error checking existing torrents:', error.response?.data || error.message);
        return null;
    }
}

async function getStreamingLinksFromTorrent(torrentInfo, apiKey) {
    try {
        if (!torrentInfo.links || torrentInfo.links.length === 0) {
            return null;
        }
        
        const streamingLinks = [];
        
        for (const downloadLink of torrentInfo.links) {
            try {
                const unrestrictResponse = await axios.post(`${REALDEBRID_API_URL}/unrestrict/link`, {
                    link: downloadLink
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                
                const unrestrictData = unrestrictResponse.data;
                
                if (unrestrictData.download) {
                    const streamingUrl = unrestrictData.download;
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
                    }
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

async function convertMagnetToRealDebridStreamingLinks(magnetLink, apiKey, postId = null, quality = null) {
    if (!apiKey) {
        return null;
    }
    
    try {
        const existingTorrent = await checkExistingTorrent(magnetLink, apiKey);
        let torrentId;
        let isNewTorrent = false;
        
        if (existingTorrent) {
            torrentId = existingTorrent.id;
            if (existingTorrent.status === 'downloaded') {
                // Update database if we have post info
                if (postId && quality) {
                    await db.updateTorrentStatus(postId, quality, torrentId, 'downloaded');
                }
                return await getStreamingLinksFromTorrent(existingTorrent, apiKey);
            }
        } else {
            isNewTorrent = true;
            try {
                const addResponse = await axios.post(`${REALDEBRID_API_URL}/torrents/addMagnet`, {
                    magnet: magnetLink
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                
                torrentId = addResponse.data.id;
            } catch (error) {
                console.error('❌ Failed to add torrent to Real-Debrid:', error.response?.data || error.message);
                return null;
            }
            
            try {
                await axios.post(`${REALDEBRID_API_URL}/torrents/selectFiles/${torrentId}`, {
                    files: 'all'
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
            } catch (error) {
                console.error('❌ Failed to select files for torrent:', error.response?.data || error.message);
                return null;
            }
        }
        
        // Wait for download to complete with shorter timeout
        // Reduced from 30 attempts (5 minutes) to 6 attempts (1 minute)
        // This prevents the script from getting stuck on slow downloads
        let attempts = 0;
        const maxAttempts = 6; // 1 minute total wait time (6 * 10 seconds)
        let currentStatus = 'unknown';
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            
            const statusResponse = await axios.get(`${REALDEBRID_API_URL}/torrents/info/${torrentId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            
            const torrentInfo = statusResponse.data;
            currentStatus = torrentInfo.status;
            
            // Update database with current status
            if (postId && quality) {
                await db.updateTorrentStatus(postId, quality, torrentId, currentStatus);
            }
            
            if (currentStatus === 'downloaded') {
                console.log(`✅ Torrent ${torrentId} downloaded successfully`);
                return await getStreamingLinksFromTorrent(torrentInfo, apiKey);
            } else if (currentStatus === 'error' || currentStatus === 'dead') {
                console.log(`❌ Torrent ${torrentId} failed with status: ${currentStatus}`);
                return null;
            } else {
                // Still downloading/processing - show progress
                // Real Debrid returns progress as a percentage (0.60 = 0.60%, 1.70 = 1.70%)
                const progress = torrentInfo.progress !== undefined 
                    ? torrentInfo.progress.toFixed(2) 
                    : 'unknown';
                console.log(`⏳ Torrent ${torrentId} status: ${currentStatus} (${progress}%) - attempt ${attempts + 1}/${maxAttempts}`);
            }
            
            attempts++;
        }
        
        // Timeout reached - torrent is still downloading
        console.log(`⏰ Timeout waiting for torrent ${torrentId} to download (still ${currentStatus})`);
        console.log(`   Will retry later - moving on to next post`);
        
        // Return a special object indicating it's still downloading
        return { stillDownloading: true, torrentId, status: currentStatus };
    } catch (error) {
        console.error('Error converting magnet to Real-Debrid:', error.response?.data || error.message);
        return null;
    }
}

// Fetch egortech posts from Reddit (matches old plugin method exactly)
async function fetchEgortechPosts(maxPosts = null) {
    const config = getConfig();
    const oauthToken = await getRedditOAuthToken();
    
    if (!oauthToken) {
        console.error('❌ Cannot fetch posts without Reddit OAuth token');
        return [];
    }
    
    console.log('🔍 Fetching egortech posts using Reddit API...');
    
    const allPosts = [];
    const foundRaces = new Set(); // Track unique races found
    let after = null;
    let pageCount = 0;
    let consecutiveEmptyPages = 0;
    const maxPages = 20;
    const maxScrollTime = Date.now() - (config.fetcher.maxScrollMonths * 30 * 24 * 60 * 60 * 1000);
    const MAX_CONSECUTIVE_EMPTY_PAGES = 2;
    
    console.log('📡 Using Reddit OAuth API for reliable access...');
    
    while (pageCount < maxPages && (!maxPosts || allPosts.length < maxPosts)) {
        pageCount++;
        console.log(`📄 Fetching page ${pageCount}...`);
        
        // Use OAuth Reddit API endpoint (exactly like old plugin)
        let url = `https://oauth.reddit.com/user/egortech/submitted?limit=100&raw_json=1`;
        if (after) {
            url += `&after=${after}`;
        }
        
        const axiosConfig = {
            headers: {
                'Authorization': `bearer ${oauthToken}`,
                'User-Agent': config.reddit.userAgent
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
                    if (!title || !title.startsWith('Formula 1')) {
                        return false;
                    }
                    
                    // Include posts within the time range
                    if (created < maxScrollTime) {
                        return false;
                    }
                    
                    return true;
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
                if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
                    console.log(`🛑 Stopping fetch after ${consecutiveEmptyPages} consecutive empty pages`);
                    break;
                }
            } else {
                consecutiveEmptyPages = 0; // Reset counter when we find posts
                
                // Track unique races found
                for (const post of pagePosts) {
                    const gp = extractGrandPrixFromTitle(post.title);
                    if (gp) {
                        const raceKey = `${gp.name}-${gp.round}`;
                        foundRaces.add(raceKey);
                    }
                    allPosts.push(post);
                }
                
                console.log(`📝 Found ${pagePosts.length} Formula 1 posts on page ${pageCount} (${foundRaces.size} unique races)`);
                
                // Also stop if we hit time limit
                const oldestPost = Math.min(...pagePosts.map(p => p.created * 1000));
                if (oldestPost < maxScrollTime) {
                    console.log(`⏰ Reached ${config.fetcher.maxScrollMonths} month time limit, stopping fetch`);
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
    
    // Log post details for debugging - show Grand Prix names
    if (allPosts.length > 0) {
        console.log(`📋 Posts found (${allPosts.length} total):`);
        allPosts.forEach(p => {
            const gp = extractGrandPrixFromTitle(p.title);
            const gpName = gp ? `${gp.name} (R${gp.round})` : 'Unknown';
            console.log(`   - ${p.id}: ${gpName} - ${p.title.substring(0, 60)}...`);
        });
    } else {
        console.log(`⚠️  No Formula 1 posts found! This might indicate a problem with Reddit API or filtering.`);
    }
    
    return allPosts;
}

// Process a single post
async function processPost(post, config) {
    const grandPrix = extractGrandPrixFromTitle(post.title);
    if (!grandPrix) {
        return null;
    }
    
    // Extract year from post title
    const postYear = extractYearFromTitle(post.title);
    const currentYear = new Date().getFullYear();
    
    // If this post is from a year that's >= current year (e.g., 2026 in 2025, or 2027 in 2026),
    // check for and delete any weekends from the previous year with the same name
    // This ensures future-proof behavior: 2027 posts will overwrite 2026, 2028 will overwrite 2027, etc.
    if (postYear >= currentYear - 1) { // Allow current year and next year
        const existingWeekends = await db.getWeekendsByName(grandPrix.name);
        if (existingWeekends && existingWeekends.length > 0) {
            const previousYear = postYear - 1;
            console.log(`🔄 Found ${postYear} post for ${grandPrix.name}, checking for old ${previousYear} weekends to overwrite...`);
            for (const existingWeekend of existingWeekends) {
                // Get the year of the existing weekend
                const existingWeekendYear = await db.getWeekendYear(grandPrix.name, existingWeekend.grand_prix_round);
                
                // Only delete if the existing weekend is from the previous year (e.g., 2025 when processing 2026)
                // This prevents deleting weekends from the same year (important for multiple posts per Grand Prix)
                if (existingWeekendYear === previousYear) {
                    // Delete the old weekend from previous year (this will cascade delete sessions and streaming links)
                    const deleted = await db.resetGrandPrix(grandPrix.name, existingWeekend.grand_prix_round);
                    console.log(`🗑️  Deleted old ${previousYear} weekend: ${grandPrix.name} (Round ${existingWeekend.grand_prix_round}) - ${deleted.postsDeleted} posts, ${deleted.weekendDeleted} weekend, ${deleted.sessionsDeleted} sessions, ${deleted.linksDeleted} links`);
                } else if (existingWeekendYear === postYear) {
                    // Same year - keep it (this handles multiple posts for the same Grand Prix in the same year)
                    console.log(`⏭️  Skipping ${grandPrix.name} (Round ${existingWeekend.grand_prix_round}) - same year (${postYear}), keeping existing weekend`);
                } else {
                    // Different year but not previous year - keep it (e.g., processing 2026 but found 2024)
                    console.log(`⏭️  Skipping ${grandPrix.name} (Round ${existingWeekend.grand_prix_round}) - from year ${existingWeekendYear}, keeping existing weekend`);
                }
            }
        }
    }
    
    const quality = extractQualityFromTitle(post.title);
    if (quality === 'Unknown') {
        return null;
    }
    
    // Check if already processed
    const alreadyProcessed = await db.isPostProcessed(post.id, quality);
    if (alreadyProcessed) {
        console.log(`⏭️  Post ${post.id} (${quality}) already processed, skipping`);
        return { skipped: true, postId: post.id, quality };
    }
    
    // Get post content
    let postContent = post.selftext_html || post.selftext || '';
    if (!postContent) {
        return null;
    }
    
    const magnetLink = extractMagnetLink(postContent);
    if (!magnetLink) {
        return null;
    }
    
    // Check if this magnet link was recently attempted and is still downloading
    const shouldSkip = await db.shouldSkipMagnetLink(magnetLink, 30); // Skip if checked within last 30 minutes
    if (shouldSkip) {
        console.log(`⏭️  Skipping ${quality} magnet link for ${grandPrix.name} - still downloading from previous attempt`);
        return { skipped: true, postId: post.id, quality, reason: 'still_downloading' };
    }
    
    const sessions = extractSessionsFromContent(postContent);
    if (sessions.length === 0) {
        return null;
    }
    
    // Mark post as processed (but not fully processed yet)
    await db.markPostProcessed({
        postId: post.id,
        postUrl: post.url,
        title: post.title,
        quality: quality,
        grandPrixName: grandPrix.name,
        grandPrixRound: grandPrix.round,
        createdUtc: post.created,
        isFullyProcessed: false,
        magnetLink: magnetLink
    });
    
    // Convert magnet to streaming links (pass postId and quality for tracking)
    console.log(`🔄 Converting ${quality} magnet link for ${grandPrix.name}...`);
    const streamingLinks = await convertMagnetToRealDebridStreamingLinks(magnetLink, config.realdebrid.apiKey, post.id, quality);
    
    // Check if torrent is still downloading
    if (streamingLinks && streamingLinks.stillDownloading) {
        console.log(`⏭️  Torrent still downloading for ${grandPrix.name} (${quality}), will retry later`);
        return { skipped: true, postId: post.id, quality, reason: 'still_downloading', torrentId: streamingLinks.torrentId };
    }
    
    if (!streamingLinks || streamingLinks.length === 0) {
        console.log(`❌ Failed to convert ${quality} magnet link for ${grandPrix.name}`);
        return { error: 'Failed to convert magnet link', postId: post.id, quality };
    }
    
    // Save weekend
    const weekendId = await db.saveWeekend(grandPrix);
    
    // Save sessions and streaming links
    for (const session of sessions) {
        const sessionId = await db.saveSession(weekendId, {
            name: session.name,
            displayName: session.name,
            date: session.date,
            duration: session.duration
        });
        
        const sessionFile = findSessionFile(streamingLinks, session.name);
        if (sessionFile) {
            await db.saveStreamingLink(sessionId, {
                quality: quality,
                url: sessionFile.url,
                filename: sessionFile.filename,
                size: sessionFile.size,
                source: 'Sky F1'
            });
        }
    }
    
    // Check if all required sessions are present and have streaming links for this quality
    const weekendData = await db.getWeekendWithSessions(grandPrix.name);
    if (weekendData && weekendData.sessions) {
        // Get all sessions for this quality (filter streams by quality)
        const sessionsForQuality = weekendData.sessions.map(s => ({
            ...s,
            streams: s.streams ? s.streams.filter(stream => stream.quality === quality) : []
        }));
        
        const sessionNames = sessionsForQuality.map(s => s.session_name);
        const allSessionsHaveStreams = sessionsForQuality.every(s => s.streams && s.streams.length > 0);
        
        // Check if all required sessions are present (convert to format expected by hasAllRequiredSessions)
        const sessionObjects = sessionsForQuality.map(s => ({ name: s.session_name }));
        
        if (hasAllRequiredSessions(sessionObjects) && allSessionsHaveStreams) {
            // Mark this post as fully processed
            await db.markPostFullyProcessed(post.id, quality);
            console.log(`✅ Post ${post.id} (${quality}) fully processed for ${grandPrix.name}`);
        }
    }
    
    return { success: true, postId: post.id, quality, grandPrix: grandPrix.name };
}

// Main fetch function with smart stopping
async function fetchAndProcess(maxWeekends = null) {
    const config = getConfig();
    
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        console.error('❌ Real Debrid not configured');
        return;
    }
    
    if (!config.reddit.clientId || !config.reddit.clientSecret || 
        !config.reddit.username || !config.reddit.password) {
        console.error('❌ Reddit API not configured');
        return;
    }
    
    console.log('🔍 Fetching egortech posts...');
    const posts = await fetchEgortechPosts();
    console.log(`📋 Found ${posts.length} Formula 1 posts`);
    
    // Group posts by Grand Prix
    const gpPosts = new Map();
    for (const post of posts) {
        const grandPrix = extractGrandPrixFromTitle(post.title);
        if (!grandPrix) continue;
        
        const gpKey = `${grandPrix.name}-${grandPrix.round}`;
        if (!gpPosts.has(gpKey)) {
            gpPosts.set(gpKey, { ...grandPrix, posts: [] });
        }
        gpPosts.get(gpKey).posts.push(post);
    }
    
    // Sort by round (newest first)
    const sortedGpKeys = Array.from(gpPosts.keys()).sort((a, b) => {
        return gpPosts.get(b).round - gpPosts.get(a).round;
    });
    
    let processedCount = 0;
    let fullyProcessedFound = false;
    
    for (const gpKey of sortedGpKeys) {
        if (maxWeekends && processedCount >= maxWeekends) {
            break;
        }
        
        const gpData = gpPosts.get(gpKey);
        console.log(`\n🏁 Processing ${gpData.name} (Round ${gpData.round})...`);
        
        // Check if weekend is already fully processed
        const weekendStatus = await db.isWeekendFullyProcessed(gpData.name, gpData.round);
        if (weekendStatus.fullyProcessed) {
            console.log(`✅ ${gpData.name} already fully processed (both 1080p and 2160p), stopping this fetch round`);
            fullyProcessedFound = true;
            break;
        }
        
        // Process posts for this weekend
        for (const post of gpData.posts) {
            const result = await processPost(post, config);
            if (result && result.success) {
                processedCount++;
            }
        }
        
        // Check again if weekend is now fully processed
        const newWeekendStatus = await db.isWeekendFullyProcessed(gpData.name, gpData.round);
        if (newWeekendStatus.fullyProcessed) {
            console.log(`✅ ${gpData.name} is now fully processed`);
        }
    }
    
    if (fullyProcessedFound) {
        console.log('\n✅ Found fully processed weekend, this fetch round complete');
    } else {
        console.log(`\n✅ Processed ${processedCount} posts, this fetch round complete`);
    }
    
    // Return normally - the fetcher-service will continue running and schedule the next fetch
    return { processedCount, fullyProcessedFound };
}

module.exports = {
    fetchAndProcess,
    fetchEgortechPosts,
    processPost
};

