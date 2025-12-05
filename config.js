const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Default configuration
const DEFAULT_CONFIG = {
    realdebrid: {
        apiKey: '',
        enabled: false
    },
    reddit: {
        clientId: '',
        clientSecret: '',
        username: '',
        password: '',
        userAgent: 'Stremula1/3.0 (by u/yourusername)'
    },
    server: {
        port: 7003,
        publicBaseUrl: ''
    },
    fetcher: {
        intervalMinutes: 15,
        maxScrollMonths: 3
    },
    updater: {
        enabled: true,
        autoPull: true,
        autoRestart: true,
        branch: 'main'
    }
};

// Load configuration
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            // Merge with defaults to ensure all keys exist
            return {
                ...DEFAULT_CONFIG,
                ...config,
                realdebrid: { ...DEFAULT_CONFIG.realdebrid, ...config.realdebrid },
                reddit: { ...DEFAULT_CONFIG.reddit, ...config.reddit },
                server: { ...DEFAULT_CONFIG.server, ...config.server },
                fetcher: { ...DEFAULT_CONFIG.fetcher, ...config.fetcher },
                updater: { ...DEFAULT_CONFIG.updater, ...(config.updater || {}) }
            };
        } else {
            // Create default config file
            saveConfig(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        }
    } catch (error) {
        console.error('❌ Error loading config:', error);
        return DEFAULT_CONFIG;
    }
}

// Save configuration
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Error saving config:', error);
        return false;
    }
}

// Get config with environment variable overrides
function getConfig() {
    const config = loadConfig();
    
    // Override with environment variables if present
    if (process.env.REALDEBRID_API_KEY) {
        config.realdebrid.apiKey = process.env.REALDEBRID_API_KEY;
        config.realdebrid.enabled = true;
    }
    
    if (process.env.REDDIT_CLIENT_ID) {
        config.reddit.clientId = process.env.REDDIT_CLIENT_ID;
    }
    if (process.env.REDDIT_CLIENT_SECRET) {
        config.reddit.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    }
    if (process.env.REDDIT_USERNAME) {
        config.reddit.username = process.env.REDDIT_USERNAME;
    }
    if (process.env.REDDIT_PASSWORD) {
        config.reddit.password = process.env.REDDIT_PASSWORD;
    }
    
    if (process.env.PORT) {
        config.server.port = parseInt(process.env.PORT);
    }
    
    if (process.env.PUBLIC_BASE_URL) {
        config.server.publicBaseUrl = process.env.PUBLIC_BASE_URL;
    }
    
    return config;
}

module.exports = {
    loadConfig,
    saveConfig,
    getConfig,
    CONFIG_PATH
};

