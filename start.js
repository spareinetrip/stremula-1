#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🏎️ Starting Stremula 1 - Real Debrid Only');
console.log('==========================================');

// Start the configuration server
console.log('Starting unified server...');
const addonServer = spawn('node', ['addon.js'], {
    cwd: __dirname,
    stdio: 'inherit'
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