const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

const CERT_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERT_DIR, 'server.key');
const CERT_PATH = path.join(CERT_DIR, 'server.crt');

/**
 * Generate self-signed certificate for local development
 */
async function generateSelfSignedCert() {
    // Create certs directory if it doesn't exist
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
    }

    // Check if certificates already exist
    if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
        return {
            key: fs.readFileSync(KEY_PATH, 'utf8'),
            cert: fs.readFileSync(CERT_PATH, 'utf8')
        };
    }

    console.log('🔐 Generating self-signed SSL certificate for local development...');

    // Get local IP addresses to include in certificate
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const altNames = ['localhost', '127.0.0.1'];
    
    // Add all local IP addresses
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                altNames.push(iface.address);
            }
        }
    }

    // Generate certificate (returns a Promise in v5.x)
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = await selfsigned.generate(attrs, {
        keySize: 2048,
        days: 365,
        algorithm: 'sha256',
        extensions: [
            {
                name: 'basicConstraints',
                cA: false
            },
            {
                name: 'keyUsage',
                keyUsage: ['digitalSignature', 'keyEncipherment']
            },
            {
                name: 'subjectAltName',
                altNames: altNames
            }
        ]
    });

    // Save certificates
    fs.writeFileSync(KEY_PATH, pems.private);
    fs.writeFileSync(CERT_PATH, pems.cert);

    console.log('✅ Self-signed certificate generated successfully');
    console.log('⚠️  Note: Browsers will show a security warning for self-signed certificates');
    console.log('   This is normal for local development. You can safely proceed.');

    return {
        key: pems.private,
        cert: pems.cert
    };
}

/**
 * Get SSL certificates, generating them if needed
 */
async function getCertificates() {
    try {
        return await generateSelfSignedCert();
    } catch (error) {
        console.error('❌ Error generating SSL certificate:', error);
        throw error;
    }
}

/**
 * Check if certificates exist
 */
function certificatesExist() {
    return fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH);
}

module.exports = {
    getCertificates,
    certificatesExist,
    CERT_DIR,
    KEY_PATH,
    CERT_PATH
};

