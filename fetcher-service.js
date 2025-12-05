const cron = require('node-cron');
const { spawn } = require('child_process');
const { fetchAndProcess } = require('./fetcher');
const { getConfig } = require('./config');
const db = require('./database');
const { checkForUpdates } = require('./updater');

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

// Check if running under concurrently
function isRunningUnderConcurrently() {
    try {
        // Check parent process command
        const ppid = process.ppid;
        if (ppid) {
            try {
                // Try to read parent process command on Unix systems
                const fs = require('fs');
                const parentCmd = fs.readFileSync(`/proc/${ppid}/cmdline`, 'utf8');
                return parentCmd.includes('concurrently') || parentCmd.includes('npm');
            } catch (e) {
                // Fallback: check environment or process title
                // If npm start was used, we're likely under concurrently
                const npmCommand = process.env.npm_lifecycle_event;
                return npmCommand === 'start';
            }
        }
    } catch (error) {
        // If we can't determine, assume we might be under concurrently if npm start
        const npmCommand = process.env.npm_lifecycle_event;
        return npmCommand === 'start';
    }
    return false;
}

// Restart the fetcher service process or entire npm start if under concurrently
function restartService() {
    console.log('🔄 Restarting fetcher service...');
    isRestarting = true;

    // Check if we're running under concurrently (via npm start)
    if (isRunningUnderConcurrently()) {
        console.log('📦 Detected npm start (concurrently), restarting entire service...');
        
        // Restart the entire npm start process
        // This ensures both server and fetcher restart together
        const restartScript = process.platform === 'win32' 
            ? 'npm.cmd' 
            : 'npm';
        
        const child = spawn(restartScript, ['start'], {
            stdio: 'inherit',
            detached: true, // Detach so it continues after parent exits
            cwd: __dirname,
            shell: true
        });

        child.on('error', (error) => {
            console.error('❌ Failed to restart npm start:', error);
            process.exit(1);
        });

        // Give the new process a moment to start
        setTimeout(() => {
            console.log('✅ New process started, exiting current process...');
            process.exit(0);
        }, 2000);
    } else {
        // Running standalone, restart just this process
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
    
    if (!config.reddit.clientId || !config.reddit.clientSecret || 
        !config.reddit.username || !config.reddit.password) {
        console.error('❌ Reddit API not configured');
        // Configuration errors shouldn't trigger auto-restart
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
        
        // Check for updates after initial fetch completes
        const updaterConfig = config.updater || { enabled: false };
        if (updaterConfig.enabled) {
            console.log('\n🔍 Checking for updates after initial fetch completion...');
            await checkForUpdates(updaterConfig, 'fetcher');
        }
    } catch (error) {
        console.error('❌ Initial fetch failed:', error);
    }
    
    // Schedule periodic fetches
    scheduledTask = cron.schedule(cronExpression, async () => {
        console.log(`\n🔄 Scheduled fetch at ${new Date().toISOString()}`);
        try {
            const result = await fetchAndProcess();
            console.log(`⏰ Next fetch scheduled in ${intervalMinutes} minutes`);
            
            // Check for updates after fetch completes (only when fetcher is idle)
            const updaterConfig = config.updater || { enabled: false };
            if (updaterConfig.enabled) {
                console.log('\n🔍 Checking for updates after fetch completion...');
                await checkForUpdates(updaterConfig, 'fetcher');
            }
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
    console.log(`⏰ Next fetch scheduled in ${intervalMinutes} minutes`);
    console.log(`🔄 Auto-restart enabled (max ${RESTART_CONFIG.maxRestarts} restarts per ${RESTART_CONFIG.restartWindowMs/1000}s)`);
    
    // Note: Auto-updater now runs after each fetch completes (not on a schedule)
    // This ensures updates only happen when fetcher is idle
    
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

