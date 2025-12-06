const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getConfig } = require('./config');

const CERT_DIR = path.join(__dirname, 'certs');
const CA_KEY_PATH = path.join(CERT_DIR, 'ca.key');
const CA_CERT_PATH = path.join(CERT_DIR, 'ca.crt');
const SERVER_KEY_PATH = path.join(CERT_DIR, 'server.key');
const SERVER_CERT_PATH = path.join(CERT_DIR, 'server.crt');
const SERVER_CSR_PATH = path.join(CERT_DIR, 'server.csr');

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
 * Generate Root CA certificate
 */
function generateRootCA() {
    if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH)) {
        console.log('✅ Root CA already exists');
        return;
    }

    console.log('🔐 Generating Root CA certificate...');

    // Create certs directory if it doesn't exist
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
    }

    // Generate CA private key
    execSync(`openssl genrsa -out "${CA_KEY_PATH}" 4096`, { stdio: 'inherit' });

    // Create CA config
    const caConfig = `[req]
distinguished_name = req_distinguished_name
prompt = no

[req_distinguished_name]
CN = Stremula Root CA
O = Stremula
C = US

[v3_ca]
basicConstraints = CA:TRUE
keyUsage = keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer:always
`;

    const caConfigPath = path.join(CERT_DIR, 'ca.conf');
    fs.writeFileSync(caConfigPath, caConfig);

    // Generate self-signed CA certificate (valid for 10 years)
    execSync(
        `openssl req -new -x509 -days 3650 -key "${CA_KEY_PATH}" -out "${CA_CERT_PATH}" -config "${caConfigPath}" -extensions v3_ca`,
        { stdio: 'inherit' }
    );

    // Clean up
    if (fs.existsSync(caConfigPath)) {
        fs.unlinkSync(caConfigPath);
    }

    console.log('✅ Root CA generated successfully');
    console.log(`   📄 CA Certificate: ${CA_CERT_PATH}`);
    console.log('   💡 Install this CA certificate on your devices to trust all server certificates');
}

/**
 * Generate server certificate signed by the Root CA
 */
function generateServerCert() {
    console.log('🔐 Generating server certificate signed by Root CA...');

    const altNames = getCurrentIPs();
    const dnsNames = [];
    const ipAddresses = [];

    for (const name of altNames) {
        if (name === 'localhost' || (!/^(\d{1,3}\.){3}\d{1,3}$/.test(name) && name !== '127.0.0.1')) {
            dnsNames.push(name);
        } else {
            ipAddresses.push(name);
        }
    }

    console.log(`   📋 Including in certificate:`);
    console.log(`      - DNS: localhost`);
    if (dnsNames.length > 1) {
        dnsNames.slice(1).forEach(dns => console.log(`      - DNS: ${dns}`));
    }
    ipAddresses.forEach(ip => console.log(`      - IP: ${ip}`));

    // Create server certificate config
    let configContent = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost
O = Stremula
C = US

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

    const configPath = path.join(CERT_DIR, 'server.conf');
    fs.writeFileSync(configPath, configContent);

    // Generate server private key
    execSync(`openssl genrsa -out "${SERVER_KEY_PATH}" 2048`, { stdio: 'inherit' });

    // Generate certificate signing request
    execSync(
        `openssl req -new -key "${SERVER_KEY_PATH}" -out "${SERVER_CSR_PATH}" -config "${configPath}"`,
        { stdio: 'inherit' }
    );

    // Sign the certificate with the CA (valid for 1 year)
    execSync(
        `openssl x509 -req -days 365 -in "${SERVER_CSR_PATH}" -CA "${CA_CERT_PATH}" -CAkey "${CA_KEY_PATH}" -CAcreateserial -out "${SERVER_CERT_PATH}" -extensions v3_req -extfile "${configPath}"`,
        { stdio: 'inherit' }
    );

    // Clean up
    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
    }
    if (fs.existsSync(SERVER_CSR_PATH)) {
        fs.unlinkSync(SERVER_CSR_PATH);
    }
    if (fs.existsSync(path.join(CERT_DIR, 'ca.srl'))) {
        fs.unlinkSync(path.join(CERT_DIR, 'ca.srl'));
    }

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

    console.log('✅ Server certificate generated and signed by Root CA');
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
                console.log(`🔄 Certificate missing IP ${ip}, regenerating...`);
                return true;
            }
        }

        return false;
    } catch (error) {
        return true;
    }
}

/**
 * Get SSL certificates, generating CA and server cert if needed
 */
async function getCertificates(forceRegenerate = false) {
    try {
        // Ensure Root CA exists
        if (!fs.existsSync(CA_KEY_PATH) || !fs.existsSync(CA_CERT_PATH)) {
            generateRootCA();
        }

        // Check if server cert needs regeneration
        if (forceRegenerate || needsRegeneration()) {
            generateServerCert();
        } else {
            console.log('✅ Existing server certificate is valid, using it');
        }

        // Return certificates in the format expected by Node.js HTTPS
        return {
            key: fs.readFileSync(SERVER_KEY_PATH, 'utf8'),
            cert: fs.readFileSync(SERVER_CERT_PATH, 'utf8'),
            ca: fs.readFileSync(CA_CERT_PATH, 'utf8')
        };
    } catch (error) {
        console.error('❌ Error generating certificates:', error);
        throw error;
    }
}

/**
 * Get the CA certificate for installation on devices
 */
function getCACertificate() {
    if (!fs.existsSync(CA_CERT_PATH)) {
        throw new Error('CA certificate not found. Run getCertificates() first.');
    }
    return fs.readFileSync(CA_CERT_PATH, 'utf8');
}

/**
 * Get CA certificate path for easy access
 */
function getCACertificatePath() {
    return CA_CERT_PATH;
}

module.exports = {
    getCertificates,
    getCACertificate,
    getCACertificatePath,
    generateRootCA,
    CERT_DIR,
    CA_CERT_PATH,
    SERVER_KEY_PATH,
    SERVER_CERT_PATH
};

