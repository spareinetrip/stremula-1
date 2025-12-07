#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadConfig, saveConfig } = require('./config');

const DEVICE_ID_FILE = path.join(__dirname, '.device-id');
const PORT = 7003;

// Get or generate device ID
function getDeviceId() {
    if (fs.existsSync(DEVICE_ID_FILE)) {
        return fs.readFileSync(DEVICE_ID_FILE, 'utf8').trim();
    }
    
    // Generate unique device ID based on hostname and random hash
    const os = require('os');
    const hostname = os.hostname();
    const randomHash = crypto.randomBytes(4).toString('hex');
    const deviceId = `${hostname}-${randomHash}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // Create full device ID with stremula-1 prefix
    // Remove any existing stremula-1 prefix to avoid duplication
    const cleanDeviceId = deviceId.replace(/^stremula-1-/, '');
    const fullDeviceId = `stremula-1-${cleanDeviceId}`;
    
    // Save for future use
    fs.writeFileSync(DEVICE_ID_FILE, fullDeviceId);
    return fullDeviceId;
}

// Update config.json with tunnel URL
function updateConfigWithTunnelUrl(tunnelUrl) {
    try {
        const config = loadConfig();
        config.server.publicBaseUrl = tunnelUrl;
        saveConfig(config);
        console.log(`✅ Updated config.json with tunnel URL: ${tunnelUrl}`);
    } catch (error) {
        console.error('❌ Failed to update config.json:', error.message);
    }
}

// Start Localtunnel
function startTunnel() {
    const deviceId = getDeviceId();
    console.log(`🚀 Starting Localtunnel with subdomain: ${deviceId}`);
    
    const lt = spawn('lt', ['--port', PORT.toString(), '--subdomain', deviceId], {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let tunnelUrl = null;
    
    // Parse tunnel URL from output
    let outputBuffer = '';
    let urlUpdated = false;
    
    lt.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(output);
        outputBuffer += output;
        
        // Look for the URL in the output - Localtunnel outputs "your url is: https://..."
        if (!urlUpdated) {
            const urlPatterns = [
                /your url is:\s*(https:\/\/[^\s]+)/i,
                /(https:\/\/[a-z0-9-]+\.loca\.lt)/i,
                /(https:\/\/[^\s]+loca\.lt[^\s]*)/i
            ];
            
            for (const pattern of urlPatterns) {
                const match = outputBuffer.match(pattern);
                if (match) {
                    const foundUrl = (match[1] || match[0]).trim();
                    if (foundUrl && foundUrl.includes('loca.lt') && foundUrl.startsWith('https://')) {
                        tunnelUrl = foundUrl;
                        console.log(`\n✅ Tunnel URL detected: ${tunnelUrl}`);
                        updateConfigWithTunnelUrl(tunnelUrl);
                        urlUpdated = true;
                        break;
                    }
                }
            }
        }
    });
    
    lt.stderr.on('data', (data) => {
        process.stderr.write(data);
    });
    
    lt.on('close', (code) => {
        if (code !== 0) {
            console.error(`❌ Localtunnel exited with code ${code}`);
            process.exit(code);
        }
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
        console.log('\n🛑 Stopping Localtunnel...');
        lt.kill('SIGTERM');
        setTimeout(() => {
            lt.kill('SIGKILL');
            process.exit(0);
        }, 5000);
    });
    
    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping Localtunnel...');
        lt.kill('SIGTERM');
        setTimeout(() => {
            lt.kill('SIGKILL');
            process.exit(0);
        }, 5000);
    });
}

startTunnel();

