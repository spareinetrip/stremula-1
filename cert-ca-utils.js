const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getConfig } = require('./config');

const CERT_DIR = path.join(__dirname, 'certs');
const CA_KEY_PATH = path.join(CERT_DIR, 'ca.key');
const CA_CERT_PATH = path.join(CERT_DIR, 'ca.crt');
const SERVER_KEY_PATH = path.join(CERT_DIR, 'server.key');
const SERVER_CSR_PATH = path.join(CERT_DIR, 'server.csr');
const SERVER_CERT_PATH = path.join(CERT_DIR, 'server.crt');
const SERVER_CERT_PEM_PATH = path.join(CERT_DIR, 'server.crt.pem');

/**
 * Extract IP address or hostname from a URL
 */
function extractHostFromUrl(url) {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        const match = url.match(/https?:\/\/([^:\/]+)/);
        return match ? match[1] : null;
    }
}

/**
 * Generate a Root CA certificate
 */
function generateRootCA() {
    console.log('🔐 Generating Root CA certificate...');
    
    // Create certs directory if it doesn't exist
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
    }

    // Check if CA already exists
    if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH)) {
        console.log('✅ Root CA already exists');
        return;
    }

    // Generate CA private key
    execSync(`openssl genrsa -out "${CA_KEY_PATH}" 4096`, { stdio: 'inherit' });

    // Generate CA certificate (valid for 10 years)
    const caConfig = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[req_distinguished_name]
CN = Stremula Root CA
O = Stremula
C = US

[v3_ca]
basicConstraints = critical,CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
`;

    const caConfigPath = path.join(CERT_DIR, 'ca.conf');
    fs.writeFileSync(caConfigPath, caConfig);

    execSync(
        `openssl req -new -x509 -days 3650 -key "${CA_KEY_PATH}" -out "${CA_CERT_PATH}" -config "${caConfigPath}"`,
        { stdio: 'inherit' }
    );

    fs.unlinkSync(caConfigPath);
    console.log('✅ Root CA generated successfully');
}

/**
 * Generate server certificate signed by the Root CA
 */
function generateServerCert() {
    console.log('🔐 Generating server certificate signed by Root CA...');

    const config = getConfig();
    const hostFromConfig = config.server.publicBaseUrl ? extractHostFromUrl(config.server.publicBaseUrl) : null;

    // Get local IP addresses
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const altNames = ['localhost', '127.0.0.1', '::1'];
    
    // Add all local IP addresses
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                altNames.push(`IP:${iface.address}`);
            } else if (iface.family === 'IPv6' && !iface.internal) {
                altNames.push(`IP:${iface.address}`);
            }
        }
    }
    
    // Add IP/hostname from publicBaseUrl config if set
    if (hostFromConfig) {
        // Check if it's an IP or hostname
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipRegex.test(hostFromConfig)) {
            altNames.push(`IP:${hostFromConfig}`);
        } else {
            altNames.push(`DNS:${hostFromConfig}`);
        }
        console.log(`   Including configured host/IP: ${hostFromConfig}`);
    }

    // Build SAN string
    const sanList = altNames.join(',');

    // Generate server private key
    execSync(`openssl genrsa -out "${SERVER_KEY_PATH}" 2048`, { stdio: 'inherit' });

    // Create certificate signing request config
    const serverConfig = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${hostFromConfig || 'localhost'}
O = Stremula
C = US

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${altNames.map((name, index) => {
    if (name.startsWith('IP:')) {
        return `IP.${index + 1} = ${name.substring(3)}`;
    } else if (name.startsWith('DNS:')) {
        return `DNS.${index + 1} = ${name.substring(4)}`;
    } else {
        return `DNS.${index + 1} = ${name}`;
    }
}).join('\n')}
`;

    const serverConfigPath = path.join(CERT_DIR, 'server.conf');
    fs.writeFileSync(serverConfigPath, serverConfig);

    // Generate certificate signing request
    execSync(
        `openssl req -new -key "${SERVER_KEY_PATH}" -out "${SERVER_CSR_PATH}" -config "${serverConfigPath}"`,
        { stdio: 'inherit' }
    );

    // Sign the certificate with the CA (valid for 1 year)
    execSync(
        `openssl x509 -req -days 365 -in "${SERVER_CSR_PATH}" -CA "${CA_CERT_PATH}" -CAkey "${CA_KEY_PATH}" -CAcreateserial -out "${SERVER_CERT_PATH}" -extensions v3_req -extfile "${serverConfigPath}"`,
        { stdio: 'inherit' }
    );

    // Clean up
    fs.unlinkSync(serverConfigPath);
    if (fs.existsSync(path.join(CERT_DIR, 'ca.srl'))) {
        fs.unlinkSync(path.join(CERT_DIR, 'ca.srl'));
    }
    if (fs.existsSync(SERVER_CSR_PATH)) {
        fs.unlinkSync(SERVER_CSR_PATH);
    }

    console.log('✅ Server certificate generated and signed by Root CA');
}

/**
 * Get SSL certificates, generating CA and server cert if needed
 */
async function getCertificates() {
    try {
        // Ensure Root CA exists
        if (!fs.existsSync(CA_KEY_PATH) || !fs.existsSync(CA_CERT_PATH)) {
            generateRootCA();
        }

        // Check if server cert needs regeneration
        const config = getConfig();
        const hostFromConfig = config.server.publicBaseUrl ? extractHostFromUrl(config.server.publicBaseUrl) : null;
        
        let needsRegeneration = false;
        if (!fs.existsSync(SERVER_KEY_PATH) || !fs.existsSync(SERVER_CERT_PATH)) {
            needsRegeneration = true;
        } else if (hostFromConfig) {
            // Check if the IP is in the certificate
            try {
                const certInfo = execSync(`openssl x509 -in "${SERVER_CERT_PATH}" -text -noout`, { encoding: 'utf8' });
                if (!certInfo.includes(hostFromConfig)) {
                    console.log(`🔄 Regenerating server certificate to include configured IP: ${hostFromConfig}`);
                    needsRegeneration = true;
                }
            } catch (e) {
                needsRegeneration = true;
            }
        }

        if (needsRegeneration) {
            generateServerCert();
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
 * Export CA certificate in DER format (for iOS installation)
 */
function exportCACertificateDER() {
    if (!fs.existsSync(CA_CERT_PATH)) {
        throw new Error('CA certificate not found. Run getCertificates() first.');
    }
    
    const derPath = path.join(CERT_DIR, 'ca.der');
    execSync(`openssl x509 -in "${CA_CERT_PATH}" -outform DER -out "${derPath}"`, { stdio: 'inherit' });
    console.log(`✅ CA certificate exported to: ${derPath}`);
    return derPath;
}

module.exports = {
    getCertificates,
    getCACertificate,
    exportCACertificateDER,
    generateRootCA,
    generateServerCert,
    CA_CERT_PATH,
    SERVER_KEY_PATH,
    SERVER_CERT_PATH,
    CERT_DIR
};

