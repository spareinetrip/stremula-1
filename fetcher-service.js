const cron = require('node-cron');
const { fetchAndProcess } = require('./fetcher');
const { getConfig } = require('./config');
const db = require('./database');

// Initialize database and start fetcher service
async function startFetcherService() {
    const config = getConfig();
    
    // Initialize database
    try {
        await db.initDatabase();
        console.log('✅ Database initialized for fetcher service');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
    
    // Check configuration
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        console.error('❌ Real Debrid not configured');
        process.exit(1);
    }
    
    if (!config.reddit.clientId || !config.reddit.clientSecret || 
        !config.reddit.username || !config.reddit.password) {
        console.error('❌ Reddit API not configured');
        process.exit(1);
    }
    
    const intervalMinutes = config.fetcher.intervalMinutes || 15;
    const cronExpression = `*/${intervalMinutes} * * * *`;
    
    console.log(`\n🔄 Fetcher service starting...`);
    console.log(`⏰ Fetch interval: Every ${intervalMinutes} minutes`);
    console.log(`📅 Cron expression: ${cronExpression}`);
    
    // Run immediately on start
    console.log('\n🚀 Running initial fetch...');
    try {
        await fetchAndProcess();
    } catch (error) {
        console.error('❌ Initial fetch failed:', error);
    }
    
    // Schedule periodic fetches
    const scheduledTask = cron.schedule(cronExpression, async () => {
        console.log(`\n🔄 Scheduled fetch at ${new Date().toISOString()}`);
        try {
            const result = await fetchAndProcess();
            console.log(`⏰ Next fetch scheduled in ${intervalMinutes} minutes`);
        } catch (error) {
            console.error('❌ Scheduled fetch failed:', error);
            console.error('⚠️  Service will continue running and retry on next schedule');
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });
    
    console.log('✅ Fetcher service running. Press Ctrl+C to stop.');
    console.log(`⏰ Next fetch scheduled in ${intervalMinutes} minutes`);
    
    // Keep the process alive
    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping fetcher service...');
        scheduledTask.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Stopping fetcher service...');
        scheduledTask.stop();
        process.exit(0);
    });
}

if (require.main === module) {
    startFetcherService().catch(console.error);
}

module.exports = { startFetcherService };

