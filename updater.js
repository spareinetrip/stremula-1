const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Default updater configuration
const DEFAULT_UPDATER_CONFIG = {
    enabled: true,
    checkIntervalHours: 6, // Check every 6 hours
    autoPull: true,
    autoRestart: true,
    branch: 'main' // Default branch
};

let isChecking = false;
let isUpdating = false;
let lastCheckTime = null;
let currentHash = null;

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

// Restart the current process
function restartProcess(scriptName) {
    console.log(`🔄 Restarting ${scriptName} after update...`);
    isUpdating = true;

    const args = process.argv.slice(1);
    const child = spawn(process.execPath, args, {
        stdio: 'inherit',
        detached: false,
        cwd: __dirname
    });

    child.on('error', (error) => {
        console.error(`❌ Failed to restart ${scriptName}:`, error);
        process.exit(1);
    });

    child.on('exit', (code) => {
        if (code !== 0) {
            console.error(`❌ ${scriptName} restart process exited with code ${code}`);
            process.exit(code);
        }
    });

    // Exit current process after spawning new one
    setTimeout(() => {
        process.exit(0);
    }, 1000);
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

// Store interval reference for cleanup
let updateCheckInterval = null;
let initialCheckTimeout = null;

// Schedule periodic update checks
function scheduleUpdateChecks(config, scriptName) {
    if (!config.enabled) {
        return null;
    }

    const intervalHours = config.checkIntervalHours || 6;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    console.log(`\n🔄 Auto-updater enabled: Checking every ${intervalHours} hours`);

    // Run initial check after 1 minute (to let service start properly)
    initialCheckTimeout = setTimeout(() => {
        checkForUpdates(config, scriptName);
    }, 60000);

    // Schedule periodic checks
    updateCheckInterval = setInterval(() => {
        checkForUpdates(config, scriptName);
    }, intervalMs);

    return updateCheckInterval;
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
}

module.exports = {
    checkForUpdates,
    scheduleUpdateChecks,
    stopUpdateChecks,
    isGitRepository,
    getCurrentHash,
    getCurrentBranch,
    DEFAULT_UPDATER_CONFIG
};

