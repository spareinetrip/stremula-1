const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const selfsigned = require('selfsigned');
const { getConfig } = require('./config');

const CERT_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERT_DIR, 'server.key');
const CERT_PATH = path.join(CERT_DIR, 'server.crt');

/**
 * Get current IP addresses that should be in the certificate
 */
function getCurrentIPs() {
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
    
    // ALWAYS add IP from config if specified (this is critical!)
    const config = getConfig();
    if (config.server.publicBaseUrl) {
        try {
            const url = new URL(config.server.publicBaseUrl);
            const hostname = url.hostname;
            // Check if it's an IP address
            if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
                if (!altNames.includes(hostname)) {
                    altNames.push(hostname);
                    console.log(`   📌 Adding IP from publicBaseUrl: ${hostname}`);
                }
            }
        } catch (e) {
            // Invalid URL, skip
        }
    }
    
    return altNames;
}

/**
 * Check if certificate needs regeneration by parsing it with openssl
 */
function needsRegeneration() {
    if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
        return true;
    }
    
    try {
        // Use openssl to properly parse the certificate and extract SAN
        const certText = execSync(`openssl x509 -in "${CERT_PATH}" -text -noout 2>/dev/null`, { encoding: 'utf8' });
        const currentIPs = getCurrentIPs();
        
        // Extract IP addresses from the certificate's SAN field
        const sanMatch = certText.match(/X509v3 Subject Alternative Name:\s*\n\s*([^\n]+(?:\n\s*[^\n]+)*)/);
        if (!sanMatch) {
            console.log('🔄 Certificate missing SAN field, regenerating...');
            return true;
        }
        
        const sanContent = sanMatch[1];
        
        // Check if all current IPs are in the certificate
        for (const ip of currentIPs) {
            // Check for both "IP Address:IP" and "IP:IP" formats
            if (!sanContent.includes(ip) && !sanContent.includes(`IP:${ip}`) && !sanContent.includes(`IP Address:${ip}`)) {
                console.log(`🔄 Certificate missing IP ${ip}, regenerating...`);
                return true;
            }
        }
        
        return false;
    } catch (error) {
        // If openssl fails or certificate is invalid, regenerate
        console.log('⚠️  Error checking certificate (openssl may not be available or cert invalid), regenerating...');
        return true;
    }
}

/**
 * Generate self-signed certificate for local development
 * Always regenerates on startup to ensure current IPs are included
 */
async function generateSelfSignedCert(forceRegenerate = false) {
    // Create certs directory if it doesn't exist
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
    }

    // Always check if regeneration is needed (even if not forced)
    const shouldRegenerate = forceRegenerate || needsRegeneration();
    
    if (!shouldRegenerate) {
        console.log('✅ Existing certificate is valid, using it');
        return {
            key: fs.readFileSync(KEY_PATH, 'utf8'),
            cert: fs.readFileSync(CERT_PATH, 'utf8')
        };
    }

    // Remove old certificates before regenerating
    if (fs.existsSync(KEY_PATH)) {
        fs.unlinkSync(KEY_PATH);
    }
    if (fs.existsSync(CERT_PATH)) {
        fs.unlinkSync(CERT_PATH);
    }

    console.log('🔐 Generating self-signed SSL certificate for local development...');

    // Get local IP addresses to include in certificate
    const altNames = getCurrentIPs();
    
    console.log(`   📋 Including in certificate:`);
    console.log(`      - DNS: localhost`);
    console.log(`      - IP: 127.0.0.1`);
    if (altNames.length > 2) {
        altNames.slice(2).forEach(ip => {
            console.log(`      - IP: ${ip}`);
        });
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
 * Always checks on startup if certificate needs regeneration
 */
async function getCertificates(forceRegenerate = false) {
    try {
        // Always check if regeneration is needed on startup
        // This ensures the certificate includes current IPs from publicBaseUrl
        return await generateSelfSignedCert(forceRegenerate);
    } catch (error) {
        console.error('❌ Error generating SSL certificate:', error);
        throw error;
    }
}

/**
 * Force regeneration of certificates
 */
async function regenerateCertificates() {
    return await getCertificates(true);
}

/**
 * Check if certificates exist
 */
function certificatesExist() {
    return fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH);
}

module.exports = {
    getCertificates,
    regenerateCertificates,
    certificatesExist,
    CERT_DIR,
    KEY_PATH,
    CERT_PATH
};

