const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Default updater configuration
const DEFAULT_UPDATER_CONFIG = {
    enabled: true,
    autoPull: true,
    autoRestart: true,
    branch: 'main' // Default branch
};

let isChecking = false;
let isUpdating = false;
let lastCheckTime = null;
let currentHash = null;

// Lock file path for coordinating restarts
const RESTART_LOCK_FILE = path.join(__dirname, '.restart-lock');

// Check if running under concurrently
function isRunningUnderConcurrently() {
    try {
        // Check parent process command
        const ppid = process.ppid;
        if (ppid) {
            try {
                // Try to read parent process command on Unix systems
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

// Acquire restart lock (returns true if lock acquired, false if already locked)
function acquireRestartLock() {
    try {
        // Check if lock file exists and is recent (within last 30 seconds)
        if (fs.existsSync(RESTART_LOCK_FILE)) {
            const lockStat = fs.statSync(RESTART_LOCK_FILE);
            const lockAge = Date.now() - lockStat.mtimeMs;
            
            // If lock is older than 30 seconds, consider it stale and remove it
            if (lockAge > 30000) {
                try {
                    fs.unlinkSync(RESTART_LOCK_FILE);
                } catch (e) {
                    // Ignore errors removing stale lock
                }
            } else {
                // Lock is active, another process is restarting
                return false;
            }
        }
        
        // Create lock file with current process PID
        fs.writeFileSync(RESTART_LOCK_FILE, process.pid.toString());
        return true;
    } catch (error) {
        // If we can't create lock, assume we can proceed (fail open)
        console.error('⚠️  Could not create restart lock:', error.message);
        return true;
    }
}

// Release restart lock
function releaseRestartLock() {
    try {
        if (fs.existsSync(RESTART_LOCK_FILE)) {
            fs.unlinkSync(RESTART_LOCK_FILE);
        }
    } catch (error) {
        // Ignore errors removing lock
    }
}

// Get current git commit hash
function getCurrentHash() {
    try {
        return execSync('git rev-parse HEAD', { 
            cwd: __dirname,
            encoding: 'utf8'
        }).trim();
    } catch (error) {
        console.error('⚠️  Could not get current git hash:', error.message);
        return null;
    }
}

// Get current branch
function getCurrentBranch() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: __dirname,
            encoding: 'utf8'
        }).trim();
    } catch (error) {
        console.error('⚠️  Could not get current git branch:', error.message);
        return 'main';
    }
}

// Check if git repository is available
function isGitRepository() {
    try {
        execSync('git rev-parse --git-dir', {
            cwd: __dirname,
            stdio: 'ignore'
        });
        return true;
    } catch (error) {
        return false;
    }
}

// Fetch latest from remote
function fetchLatest(branch) {
    try {
        console.log(`🔄 Fetching latest from origin/${branch}...`);
        execSync(`git fetch origin ${branch}`, {
            cwd: __dirname,
            stdio: 'inherit'
        });
        return true;
    } catch (error) {
        console.error('❌ Failed to fetch from remote:', error.message);
        return false;
    }
}

// Check if there are updates available
function hasUpdates(branch) {
    try {
        const currentHash = getCurrentHash();
        if (!currentHash) {
            return false;
        }

        // Compare with remote
        const remoteHash = execSync(`git rev-parse origin/${branch}`, {
            cwd: __dirname,
            encoding: 'utf8'
        }).trim();

        return currentHash !== remoteHash;
    } catch (error) {
        console.error('⚠️  Could not check for updates:', error.message);
        return false;
    }
}

// Pull latest changes
function pullUpdates(branch) {
    try {
        console.log(`⬇️  Pulling latest changes from origin/${branch}...`);
        execSync(`git pull origin ${branch}`, {
            cwd: __dirname,
            stdio: 'inherit'
        });
        return true;
    } catch (error) {
        console.error('❌ Failed to pull updates:', error.message);
        return false;
    }
}

// Check if package.json changed
function packageJsonChanged() {
    try {
        // Check if package.json was modified in the last pull
        const result = execSync('git diff HEAD@{1} HEAD --name-only', {
            cwd: __dirname,
            encoding: 'utf8'
        });
        return result.includes('package.json') || result.includes('package-lock.json');
    } catch (error) {
        // If we can't check, assume it might have changed and run npm install
        return true;
    }
}

// Install dependencies
function installDependencies() {
    try {
        console.log('📦 Installing dependencies...');
        execSync('npm install', {
            cwd: __dirname,
            stdio: 'inherit'
        });
        return true;
    } catch (error) {
        console.error('❌ Failed to install dependencies:', error.message);
        return false;
    }
}

// Restart the current process or entire npm start if under concurrently
function restartProcess(scriptName) {
    console.log(`🔄 Restarting ${scriptName} after update...`);
    isUpdating = true;

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
            console.error(`❌ Failed to restart npm start:`, error);
            releaseRestartLock();
            process.exit(1);
        });

        // Give the new process a moment to start
        setTimeout(() => {
            console.log('✅ New process started, exiting current process...');
            releaseRestartLock();
            process.exit(0);
        }, 2000);
    } else {
        // Running standalone, restart just this process
        const args = process.argv.slice(1);
        const child = spawn(process.execPath, args, {
            stdio: 'inherit',
            detached: false,
            cwd: __dirname
        });

        child.on('error', (error) => {
            console.error(`❌ Failed to restart ${scriptName}:`, error);
            releaseRestartLock();
            process.exit(1);
        });

        child.on('exit', (code) => {
            if (code !== 0) {
                console.error(`❌ ${scriptName} restart process exited with code ${code}`);
                releaseRestartLock();
                process.exit(code);
            }
        });

        // Exit current process after spawning new one
        setTimeout(() => {
            releaseRestartLock();
            process.exit(0);
        }, 1000);
    }
}

// Main update check function
async function checkForUpdates(config, scriptName = 'service') {
    if (isChecking || isUpdating) {
        return;
    }

    // Check if updater is enabled
    if (!config.enabled) {
        return;
    }

    // Check if git repository is available
    if (!isGitRepository()) {
        console.log('⚠️  Not a git repository, skipping update check');
        return;
    }

    isChecking = true;
    lastCheckTime = new Date();

    try {
        const branch = config.branch || getCurrentBranch();
        
        console.log(`\n🔍 Checking for updates on branch: ${branch}`);
        
        // Fetch latest
        if (!fetchLatest(branch)) {
            isChecking = false;
            return;
        }

        // Check for updates
        if (!hasUpdates(branch)) {
            console.log('✅ Already up to date');
            isChecking = false;
            return;
        }

        console.log('🆕 Updates found!');

        // Auto-pull if enabled
        if (config.autoPull) {
            if (!pullUpdates(branch)) {
                isChecking = false;
                return;
            }

            // Check if dependencies need to be updated
            if (packageJsonChanged()) {
                if (!installDependencies()) {
                    console.error('⚠️  Failed to install dependencies, but continuing...');
                }
            }

            // Auto-restart if enabled
            if (config.autoRestart) {
                // Try to acquire restart lock to prevent both processes from restarting
                if (!acquireRestartLock()) {
                    console.log('⏸️  Another process is already restarting, skipping restart...');
                    isChecking = false;
                    return;
                }
                
                console.log(`\n⏳ Waiting 2 seconds before restart...`);
                setTimeout(() => {
                    restartProcess(scriptName);
                }, 2000);
                return; // Don't set isChecking = false, we're restarting
            }
        } else {
            console.log('ℹ️  Updates available but auto-pull is disabled');
        }

    } catch (error) {
        console.error('❌ Error checking for updates:', error);
    } finally {
        if (!isUpdating) {
            isChecking = false;
        }
    }
}

// Note: Auto-updater is now called directly after fetches complete
// This ensures updates only happen when the fetcher is idle, preventing conflicts
// The scheduling functions below are kept for backwards compatibility but are no longer used

// Store interval reference for cleanup (deprecated - not used anymore)
let updateCheckInterval = null;
let initialCheckTimeout = null;

// Schedule periodic update checks (DEPRECATED - not used anymore)
// Updates are now checked after each fetch completes in fetcher-service.js
function scheduleUpdateChecks(config, scriptName) {
    // This function is deprecated - updates are now checked after fetches complete
    // Kept for backwards compatibility but does nothing
    console.log('⚠️  scheduleUpdateChecks is deprecated - updates are now checked after fetches complete');
    return null;
}

// Stop update checks (cleanup)
function stopUpdateChecks() {
    if (initialCheckTimeout) {
        clearTimeout(initialCheckTimeout);
        initialCheckTimeout = null;
    }
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
        updateCheckInterval = null;
    }
    // Clean up restart lock on normal shutdown
    releaseRestartLock();
}

// Cleanup on process exit
process.on('exit', () => {
    releaseRestartLock();
});

process.on('SIGINT', () => {
    releaseRestartLock();
    process.exit(0);
});

process.on('SIGTERM', () => {
    releaseRestartLock();
    process.exit(0);
});

module.exports = {
    checkForUpdates,
    scheduleUpdateChecks,
    stopUpdateChecks,
    isGitRepository,
    getCurrentHash,
    getCurrentBranch,
    DEFAULT_UPDATER_CONFIG
};

