const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getConfig } = require('./config');

const CERT_DIR = path.join(__dirname, 'certs');
const SERVER_KEY_PATH = path.join(CERT_DIR, 'server.key');
const SERVER_CERT_PATH = path.join(CERT_DIR, 'server.crt');
const CA_CERT_PATH = path.join(CERT_DIR, 'rootCA.pem'); // mkcert stores CA here

/**
 * Check if mkcert is installed
 */
function isMkcertInstalled() {
    try {
        execSync('mkcert -version', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Install mkcert CA (one-time setup)
 */
function installMkcertCA() {
    try {
        console.log('🔐 Installing mkcert local CA...');
        execSync('mkcert -install', { stdio: 'inherit' });
        console.log('✅ mkcert CA installed successfully');
        
        // Copy the CA certificate to our certs directory for easy access
        const homeDir = require('os').homedir();
        const mkcertCARoot = process.platform === 'darwin' 
            ? path.join(homeDir, 'Library/Application Support/mkcert')
            : process.platform === 'win32'
            ? path.join(homeDir, 'AppData/Local/mkcert')
            : path.join(homeDir, '.local/share/mkcert');
        
        const mkcertCAFile = path.join(mkcertCARoot, 'rootCA.pem');
        if (fs.existsSync(mkcertCAFile)) {
            if (!fs.existsSync(CERT_DIR)) {
                fs.mkdirSync(CERT_DIR, { recursive: true });
            }
            fs.copyFileSync(mkcertCAFile, CA_CERT_PATH);
            console.log(`   📄 CA certificate copied to: ${CA_CERT_PATH}`);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Failed to install mkcert CA:', error.message);
        return false;
    }
}

/**
 * Get current IP addresses and hostnames that should be in the certificate
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
            } else {
                // It's a hostname/domain
                if (!altNames.includes(hostname)) {
                    altNames.push(hostname);
                    console.log(`   📌 Adding hostname from publicBaseUrl: ${hostname}`);
                }
            }
        } catch (e) {
            // Invalid URL, skip
        }
    }
    
    return altNames;
}

/**
 * Check if certificate needs regeneration
 */
function needsRegeneration() {
    if (!fs.existsSync(SERVER_KEY_PATH) || !fs.existsSync(SERVER_CERT_PATH)) {
        return true;
    }

    try {
        const certText = execSync(`openssl x509 -in "${SERVER_CERT_PATH}" -text -noout 2>/dev/null`, { encoding: 'utf8' });
        const currentIPs = getCurrentIPs();
        const sanMatch = certText.match(/X509v3 Subject Alternative Name:\s*\n\s*([^\n]+(?:\n\s*[^\n]+)*)/);
        
        if (!sanMatch) {
            return true;
        }

        const sanContent = sanMatch[1];
        for (const ip of currentIPs) {
            if (!sanContent.includes(ip) && !sanContent.includes(`IP:${ip}`) && !sanContent.includes(`IP Address:${ip}`)) {
                console.log(`🔄 Certificate missing ${ip}, regenerating...`);
                return true;
            }
        }

        return false;
    } catch (error) {
        return true;
    }
}

/**
 * Generate certificate using mkcert
 */
function generateMkcertCertificate() {
    console.log('🔐 Generating certificate using mkcert...');

    const altNames = getCurrentIPs();
    
    console.log(`   📋 Including in certificate:`);
    altNames.forEach(name => {
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(name)) {
            console.log(`      - IP: ${name}`);
        } else {
            console.log(`      - DNS: ${name}`);
        }
    });

    // Create certs directory if it doesn't exist
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
    }

    // Remove old certificates
    if (fs.existsSync(SERVER_KEY_PATH)) {
        fs.unlinkSync(SERVER_KEY_PATH);
    }
    if (fs.existsSync(SERVER_CERT_PATH)) {
        fs.unlinkSync(SERVER_CERT_PATH);
    }

    // Build mkcert command with all IPs and hostnames
    // mkcert format: mkcert -cert-file cert.pem -key-file key.pem hostname1 hostname2 ip1 ip2
    const mkcertArgs = altNames.join(' ');
    
    try {
        // Generate certificate using mkcert with explicit output file names
        execSync(
            `mkcert -cert-file "${SERVER_CERT_PATH}" -key-file "${SERVER_KEY_PATH}" ${mkcertArgs}`,
            { stdio: 'inherit', cwd: CERT_DIR }
        );

        // Verify the certificate
        try {
            const certText = execSync(`openssl x509 -in "${SERVER_CERT_PATH}" -text -noout 2>/dev/null`, { encoding: 'utf8' });
            const sanMatch = certText.match(/X509v3 Subject Alternative Name:\s*\n\s*([^\n]+(?:\n\s*[^\n]+)*)/);
            if (sanMatch) {
                const sanContent = sanMatch[1];
                console.log('   ✅ Certificate SAN verified:', sanContent.replace(/\s+/g, ' ').trim());
            }
        } catch (e) {
            // Verification failed, but continue
        }

        console.log('✅ Certificate generated successfully using mkcert');
        return true;
    } catch (error) {
        console.error('❌ Failed to generate certificate with mkcert:', error.message);
        throw error;
    }
}

/**
 * Get SSL certificates, generating them if needed using mkcert
 */
async function getCertificates(forceRegenerate = false) {
    // Check if mkcert is installed
    if (!isMkcertInstalled()) {
        throw new Error(
            'mkcert is not installed. Please install it first:\n' +
            '  macOS: brew install mkcert\n' +
            '  Linux: See https://github.com/FiloSottile/mkcert#linux\n' +
            '  Windows: choco install mkcert or scoop install mkcert'
        );
    }

    // Install mkcert CA if not already installed
    const homeDir = require('os').homedir();
    const mkcertCARoot = process.platform === 'darwin' 
        ? path.join(homeDir, 'Library/Application Support/mkcert')
        : process.platform === 'win32'
        ? path.join(homeDir, 'AppData/Local/mkcert')
        : path.join(homeDir, '.local/share/mkcert');
    
    const mkcertCAFile = path.join(mkcertCARoot, 'rootCA.pem');
    if (!fs.existsSync(mkcertCAFile)) {
        console.log('⚠️  mkcert CA not found, installing...');
        if (!installMkcertCA()) {
            throw new Error('Failed to install mkcert CA. Please run "mkcert -install" manually.');
        }
    } else {
        // Copy CA to our certs directory for easy access
        if (!fs.existsSync(CERT_DIR)) {
            fs.mkdirSync(CERT_DIR, { recursive: true });
        }
        if (!fs.existsSync(CA_CERT_PATH)) {
            fs.copyFileSync(mkcertCAFile, CA_CERT_PATH);
        }
    }

    // Check if server cert needs regeneration
    if (forceRegenerate || needsRegeneration()) {
        generateMkcertCertificate();
    } else {
        console.log('✅ Existing certificate is valid, using it');
    }

    // Return certificates in the format expected by Node.js HTTPS
    return {
        key: fs.readFileSync(SERVER_KEY_PATH, 'utf8'),
        cert: fs.readFileSync(SERVER_CERT_PATH, 'utf8')
    };
}

/**
 * Get the CA certificate for installation on other devices
 */
function getCACertificate() {
    if (!fs.existsSync(CA_CERT_PATH)) {
        // Try to find it in mkcert's default location
        const homeDir = require('os').homedir();
        const mkcertCARoot = process.platform === 'darwin' 
            ? path.join(homeDir, 'Library/Application Support/mkcert')
            : process.platform === 'win32'
            ? path.join(homeDir, 'AppData/Local/mkcert')
            : path.join(homeDir, '.local/share/mkcert');
        
        const mkcertCAFile = path.join(mkcertCARoot, 'rootCA.pem');
        if (fs.existsSync(mkcertCAFile)) {
            return fs.readFileSync(mkcertCAFile, 'utf8');
        }
        throw new Error('CA certificate not found. Run getCertificates() first.');
    }
    return fs.readFileSync(CA_CERT_PATH, 'utf8');
}

/**
 * Get CA certificate path for easy access
 */
function getCACertificatePath() {
    if (fs.existsSync(CA_CERT_PATH)) {
        return CA_CERT_PATH;
    }
    // Try mkcert's default location
    const homeDir = require('os').homedir();
    const mkcertCARoot = process.platform === 'darwin' 
        ? path.join(homeDir, 'Library/Application Support/mkcert')
        : process.platform === 'win32'
        ? path.join(homeDir, 'AppData/Local/mkcert')
        : path.join(homeDir, '.local/share/mkcert');
    
    const mkcertCAFile = path.join(mkcertCARoot, 'rootCA.pem');
    if (fs.existsSync(mkcertCAFile)) {
        return mkcertCAFile;
    }
    return CA_CERT_PATH;
}

module.exports = {
    getCertificates,
    getCACertificate,
    getCACertificatePath,
    isMkcertInstalled,
    installMkcertCA,
    CERT_DIR,
    CA_CERT_PATH,
    SERVER_KEY_PATH,
    SERVER_CERT_PATH
};

