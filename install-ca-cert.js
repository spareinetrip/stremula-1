#!/usr/bin/env node

/**
 * Script to export CA certificate for installation on iOS/tvOS devices
 */

const { exportCACertificateDER, getCertificates, CERT_DIR } = require('./cert-ca-utils');
const path = require('path');
const http = require('http');
const fs = require('fs');

async function main() {
    console.log('🔐 Setting up CA-signed certificates...\n');

    try {
        // Generate certificates if needed
        await getCertificates();
        
        // Export CA certificate in DER format (for iOS)
        const derPath = exportCACertificateDER();
        
        console.log('\n📱 Installation Instructions for iOS/tvOS:\n');
        console.log('1. Transfer the CA certificate to your device:');
        console.log(`   - Email: ${path.basename(derPath)}`);
        console.log(`   - Or use AirDrop, or host it on a simple HTTP server\n`);
        
        console.log('2. On iOS:');
        console.log('   - Open the .der file (tap it in email/files)');
        console.log('   - Tap "Install" when prompted');
        console.log('   - Go to Settings → General → About → Certificate Trust Settings');
        console.log('   - Enable "Full Trust" for "Stremula Root CA"\n');
        
        console.log('3. On tvOS:');
        console.log('   - Use Apple Configurator or MDM to install the certificate');
        console.log('   - Or use Xcode to install via device management\n');
        
        console.log('4. After installing, restart Stremio and try connecting again.\n');
        
        // Optionally start a simple HTTP server to serve the certificate
        const serveCert = process.argv.includes('--serve');
        if (serveCert) {
            const port = 8080;
            const server = http.createServer((req, res) => {
                if (req.url === '/ca.der' || req.url === '/') {
                    res.writeHead(200, {
                        'Content-Type': 'application/x-x509-ca-cert',
                        'Content-Disposition': 'attachment; filename="ca.der"'
                    });
                    fs.createReadStream(derPath).pipe(res);
                } else {
                    res.writeHead(404);
                    res.end('Not found');
                }
            });
            
            server.listen(port, () => {
                console.log(`\n🌐 Certificate server running at:`);
                console.log(`   http://YOUR_PI_IP:${port}/ca.der`);
                console.log(`\n   Open this URL on your iOS device to download the certificate.\n`);
                console.log('   Press Ctrl+C to stop the server.\n');
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };

