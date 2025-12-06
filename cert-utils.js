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

    // Use openssl directly to generate certificate with all IPs
    // The selfsigned library v5.x ignores custom extensions, so we use openssl instead
    try {
        // Generate private key
        execSync(`openssl genrsa -out "${KEY_PATH}" 2048`, { stdio: 'inherit' });
        
        // Create certificate config with all IPs
        const configPath = path.join(CERT_DIR, 'cert.conf');
        const dnsNames = [];
        const ipAddresses = [];
        
        for (const name of altNames) {
            if (name === 'localhost' || (!/^(\d{1,3}\.){3}\d{1,3}$/.test(name) && name !== '127.0.0.1')) {
                dnsNames.push(name);
            } else {
                ipAddresses.push(name);
            }
        }
        
        let configContent = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
`;
        
        // Add DNS names
        dnsNames.forEach((dns, index) => {
            configContent += `DNS.${index + 1} = ${dns}\n`;
        });
        
        // Add IP addresses
        ipAddresses.forEach((ip, index) => {
            configContent += `IP.${index + 1} = ${ip}\n`;
        });
        
        fs.writeFileSync(configPath, configContent);
        
        // Generate certificate signing request
        execSync(
            `openssl req -new -key "${KEY_PATH}" -out "${path.join(CERT_DIR, 'server.csr')}" -config "${configPath}"`,
            { stdio: 'inherit' }
        );
        
        // Generate self-signed certificate (valid for 365 days)
        execSync(
            `openssl x509 -req -days 365 -in "${path.join(CERT_DIR, 'server.csr')}" -signkey "${KEY_PATH}" -out "${CERT_PATH}" -extensions v3_req -extfile "${configPath}"`,
            { stdio: 'inherit' }
        );
        
        // Clean up temporary files
        if (fs.existsSync(path.join(CERT_DIR, 'server.csr'))) {
            fs.unlinkSync(path.join(CERT_DIR, 'server.csr'));
        }
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
        
        // Read the generated certificate and key
        const cert = fs.readFileSync(CERT_PATH, 'utf8');
        const key = fs.readFileSync(KEY_PATH, 'utf8');
        
        return {
            key: key,
            cert: cert
        };
    } catch (error) {
        // Fallback to selfsigned library if openssl fails
        console.log('⚠️  openssl not available, falling back to selfsigned library (limited IP support)');
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = await selfsigned.generate(attrs, {
            keySize: 2048,
            days: 365,
            algorithm: 'sha256'
        });
        
        fs.writeFileSync(KEY_PATH, pems.private);
        fs.writeFileSync(CERT_PATH, pems.cert);
        
        return {
            key: pems.private,
            cert: pems.cert
        };
    }

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

