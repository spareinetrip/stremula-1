const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const { getConfig } = require('./config');

const CERT_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERT_DIR, 'server.key');
const CERT_PATH = path.join(CERT_DIR, 'server.crt');

/**
 * Extract IP address or hostname from a URL
 */
function extractHostFromUrl(url) {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        // If URL parsing fails, try to extract IP/hostname manually
        const match = url.match(/https?:\/\/([^:\/]+)/);
        return match ? match[1] : null;
    }
}

/**
 * Generate self-signed certificate for local development
 */
async function generateSelfSignedCert(forceRegenerate = false) {
    // Create certs directory if it doesn't exist
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
    }

    // Get config to check if we need to regenerate
    const config = getConfig();
    const hostFromConfig = config.server.publicBaseUrl ? extractHostFromUrl(config.server.publicBaseUrl) : null;
    
    // Check if certificates already exist and if they need regeneration
    if (!forceRegenerate && fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
        // If config has a publicBaseUrl with an IP, check if it's in the certificate
        if (hostFromConfig) {
            try {
                const certContent = fs.readFileSync(CERT_PATH, 'utf8');
                // Simple check: if the IP is not in the certificate content, regenerate
                if (!certContent.includes(hostFromConfig)) {
                    console.log(`🔄 Regenerating certificate to include configured IP: ${hostFromConfig}`);
                    deleteCertificates();
                } else {
                    // Certificate exists and includes the configured IP
                    return {
                        key: fs.readFileSync(KEY_PATH, 'utf8'),
                        cert: fs.readFileSync(CERT_PATH, 'utf8')
                    };
                }
            } catch (e) {
                // If we can't read the cert, regenerate it
                console.log('🔄 Regenerating certificate due to read error');
                deleteCertificates();
            }
        } else {
            // No publicBaseUrl configured, use existing cert if it exists
            return {
                key: fs.readFileSync(KEY_PATH, 'utf8'),
                cert: fs.readFileSync(CERT_PATH, 'utf8')
            };
        }
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
    
    // Add IP/hostname from publicBaseUrl config if set (config already loaded above)
    if (hostFromConfig && !altNames.includes(hostFromConfig)) {
        altNames.push(hostFromConfig);
        console.log(`   Including configured host/IP: ${hostFromConfig}`);
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

/**
 * Delete existing certificates to force regeneration
 */
function deleteCertificates() {
    let deleted = false;
    if (fs.existsSync(KEY_PATH)) {
        fs.unlinkSync(KEY_PATH);
        deleted = true;
    }
    if (fs.existsSync(CERT_PATH)) {
        fs.unlinkSync(CERT_PATH);
        deleted = true;
    }
    return deleted;
}

module.exports = {
    getCertificates,
    certificatesExist,
    deleteCertificates,
    CERT_DIR,
    KEY_PATH,
    CERT_PATH
};

