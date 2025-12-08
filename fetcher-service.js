const cron = require('node-cron');
const { spawn } = require('child_process');
const { fetchAndProcess } = require('./fetcher');
const { getConfig } = require('./config');
const db = require('./database');

// Auto-restart configuration
const RESTART_CONFIG = {
    maxRestarts: 5, // Maximum restart attempts
    restartWindowMs: 60000, // 1 minute window
    restartDelayMs: 5000, // 5 second delay before restart
};

// Track restart attempts
let restartAttempts = [];
let isRestarting = false;
let scheduledTask = null;
let errorHandlersSetup = false;

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
    
    // Gracefully shutdown
    shutdownService(() => {
        console.log(`⏳ Waiting ${RESTART_CONFIG.restartDelayMs}ms before restart...`);
        setTimeout(() => {
            restartService();
        }, RESTART_CONFIG.restartDelayMs);
    });
}

// Gracefully shutdown the fetcher service
function shutdownService(callback) {
    isRestarting = true;
    
    if (scheduledTask) {
        try {
            scheduledTask.stop();
            console.log('✅ Scheduled task stopped');
        } catch (error) {
            console.error('⚠️  Error stopping scheduled task:', error);
        }
        scheduledTask = null;
    }
    
    // Small delay to allow cleanup
    setTimeout(callback, 1000);
}

// Restart the fetcher service process
function restartService() {
    console.log('🔄 Restarting fetcher service...');
    isRestarting = true;

    // Use child_process to spawn a new instance
    const args = process.argv.slice(1);
    const child = spawn(process.execPath, args, {
        stdio: 'inherit',
        detached: false
    });

    child.on('error', (error) => {
        console.error('❌ Failed to restart fetcher service:', error);
        process.exit(1);
    });

    child.on('exit', (code) => {
        if (code !== 0) {
            console.error(`❌ Fetcher service restart process exited with code ${code}`);
            process.exit(code);
        }
    });

    // Exit current process after spawning new one
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

// Parse command line arguments
const args = process.argv.slice(2);
const forceWeekend = args.includes('--force-weekend') || args.includes('--skip-weekend-check');

// Helper function to log all available CLI commands
function logAvailableCommands() {
    console.log('\n📋 Available CLI Commands:');
    console.log('   Fetch Commands:');
    console.log('     --fetch1p, --fetch2p, --fetch3p, etc.  Fetch specific number of weekends');
    console.log('     --force-weekend                        Override weekday check (fetch any day)');
    console.log('   Reset Commands:');
    console.log('     --reset-cache, --reset                 Reset processed posts cache');
    console.log('     --reset-all                            Reset all data');
    console.log('     --reset-gp="GP Name"                   Reset specific Grand Prix');
    console.log('     --reset-gp="GP Name R21"               Reset specific Grand Prix round');
    console.log('');
}

// Initialize database and start fetcher service
async function startFetcherService() {
    // Reset restart flag
    isRestarting = false;

    // Setup global error handlers on first run
    if (!errorHandlersSetup) {
        setupGlobalErrorHandlers();
        errorHandlersSetup = true;
    }
    
    // Log available commands on startup
    logAvailableCommands();
    
    const config = getConfig();
    
    // Initialize database
    try {
        await db.initDatabase();
        console.log('✅ Database initialized for fetcher service');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        handleCriticalError('databaseInit', error);
        return;
    }
    
    // Check configuration
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        console.error('❌ Real Debrid not configured');
        // Configuration errors shouldn't trigger auto-restart
        process.exit(1);
    }
    
    const intervalMinutes = config.fetcher.intervalMinutes || 30;
    // Cron expression: every 30 minutes, but only on Friday (5), Saturday (6), and Sunday (0)
    // Format: minute hour day-of-month month day-of-week
    // Day of week: 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    const cronExpression = `*/${intervalMinutes} * * * 0,5,6`;
    
    // Helper function to check if today is Friday, Saturday, or Sunday
    function isRaceWeekendDay() {
        const now = new Date();
        const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
        return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Sunday, Friday, Saturday
    }
    
    console.log(`\n🔄 Fetcher service starting...`);
    console.log(`⏰ Fetch interval: Every ${intervalMinutes} minutes`);
    if (forceWeekend) {
        console.log(`⚠️  Weekday check OVERRIDDEN (--force-weekend flag detected)`);
        console.log(`📅 Fetching on ALL days (not just race weekends)`);
    } else {
        console.log(`📅 Only on race weekends: Friday, Saturday, Sunday`);
    }
    console.log(`📅 Cron expression: ${cronExpression}`);
    
    // Run immediately on start only if it's a race weekend day (or if forced)
    if (forceWeekend || isRaceWeekendDay()) {
        if (forceWeekend) {
            console.log('\n🚀 Running initial fetch (--force-weekend flag detected)...');
        } else {
            console.log('\n🚀 Running initial fetch (race weekend day detected)...');
        }
        try {
            await fetchAndProcess();
        } catch (error) {
            console.error('❌ Initial fetch failed:', error);
        }
    } else {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDay = dayNames[new Date().getUTCDay()];
        console.log(`\n⏭️  Skipping initial fetch (today is ${currentDay}, not a race weekend day)`);
        console.log(`   Will start fetching automatically on Friday, Saturday, or Sunday`);
        console.log(`   Use --force-weekend flag to override this check`);
    }
    
    // Schedule periodic fetches
    // If forceWeekend is enabled, use a simpler cron that runs every 30 minutes on all days
    const actualCronExpression = forceWeekend ? `*/${intervalMinutes} * * * *` : cronExpression;
    
    scheduledTask = cron.schedule(actualCronExpression, async () => {
        // Double-check it's actually a race weekend day (safety check) - unless forced
        if (!forceWeekend && !isRaceWeekendDay()) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const currentDay = dayNames[new Date().getUTCDay()];
            console.log(`\n⏭️  Skipping fetch (today is ${currentDay}, not a race weekend day)`);
            return;
        }
        
        console.log(`\n🔄 Scheduled fetch at ${new Date().toISOString()}`);
        if (forceWeekend) {
            console.log(`   (Weekday check overridden)`);
        }
        try {
            const result = await fetchAndProcess();
            console.log(`⏰ Next fetch scheduled in ${intervalMinutes} minutes`);
        } catch (error) {
            console.error('❌ Scheduled fetch failed:', error);
            console.error('Stack:', error.stack);
            console.error('⚠️  Service will continue running and retry on next schedule');
            // Don't restart for fetch errors - these are expected and handled gracefully
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });
    
    console.log('✅ Fetcher service running. Press Ctrl+C to stop.');
    if (forceWeekend) {
        console.log(`⏰ Fetching every ${intervalMinutes} minutes on ALL days (weekday check overridden)`);
    } else {
        console.log(`⏰ Fetching every ${intervalMinutes} minutes on Friday, Saturday, and Sunday only`);
    }
    console.log(`🔄 Auto-restart enabled (max ${RESTART_CONFIG.maxRestarts} restarts per ${RESTART_CONFIG.restartWindowMs/1000}s)`);
    
    // Keep the process alive
    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping fetcher service...');
        if (scheduledTask) {
            scheduledTask.stop();
        }
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Stopping fetcher service...');
        if (scheduledTask) {
            scheduledTask.stop();
        }
        process.exit(0);
    });
}

if (require.main === module) {
    startFetcherService().catch((error) => {
        console.error('❌ Failed to start fetcher service:', error);
        handleCriticalError('startup', error);
    });
}

module.exports = { startFetcherService };

