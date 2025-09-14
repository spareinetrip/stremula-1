#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🏎️ Starting Stremula 1 - Real Debrid Only');
console.log('==========================================');
console.log('🔧 Command Interface: ENABLED');
console.log('💡 Type "help" in the terminal for available commands');

// Start the configuration server with CLI enabled
console.log('Starting unified server with command interface...');
const addonServer = spawn('node', ['addon.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
        ...process.env,
        ENABLE_CLI: '1'
    }
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    addonServer.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    addonServer.kill('SIGTERM');
    process.exit(0);
});

console.log('\nServer starting...');