# Installing CA Certificate on iOS and Apple TV

This guide explains how to install the Root CA certificate on your iOS and Apple TV devices so they will trust your Stremio addon's SSL certificate.

## How It Works

Instead of using a self-signed certificate (which iOS/tvOS reject), we:
1. **Create a Root Certificate Authority (CA)** on your Raspberry Pi
2. **Sign the server certificate** with that CA
3. **Install the Root CA** on your iOS/tvOS devices
4. Your devices will now trust any certificate signed by that CA

This is the **proper way** to use self-signed certificates and is what enterprises do for internal services.

## Prerequisites

- **OpenSSL** must be installed on your Raspberry Pi:
  ```bash
  sudo apt-get update
  sudo apt-get install openssl
  ```

## Step 1: Generate CA and Server Certificates

The certificates will be automatically generated when you start the server. But you can also generate them manually:

```bash
cd ~/stremula-1  # or wherever your project is
npm run install-ca
```

This will:
- Generate a Root CA certificate
- Generate a server certificate signed by the CA
- Export the CA certificate in DER format (for iOS installation)

## Step 2: Transfer CA Certificate to Your Device

You have several options:

### Option A: Email (Easiest)

1. On your Raspberry Pi, the CA certificate is saved as `certs/ca.der`
2. Email this file to yourself
3. Open the email on your iOS device
4. Tap the attachment to download it

### Option B: HTTP Server (Recommended)

Run the certificate server:

```bash
npm run serve-ca
```

This starts a simple HTTP server on port 8080. Then on your iOS device:

1. Open Safari
2. Go to: `http://YOUR_PI_IP:8080/ca.der` (replace with your Pi's IP)
3. The certificate will download automatically

### Option C: AirDrop (macOS/iOS only)

If you have a Mac:
1. Copy `certs/ca.der` to your Mac
2. AirDrop it to your iOS device

### Option D: USB/iTunes (for Apple TV)

For Apple TV, you'll need to use:
- **Apple Configurator** (macOS app)
- Or **Xcode** device management
- Or an **MDM solution**

## Step 3: Install on iOS

1. **Open the certificate file** (from email, Safari download, etc.)
   - You'll see a profile installation screen

2. **Install the profile:**
   - Tap "Install" in the top right
   - Enter your device passcode if prompted
   - Tap "Install" again to confirm

3. **Enable Full Trust:**
   - Go to **Settings** → **General** → **About** → **Certificate Trust Settings**
   - Find **"Stremula Root CA"** in the list
   - Toggle the switch to **ON** (green)
   - Tap "Continue" to confirm

4. **Done!** Your iOS device will now trust certificates signed by this CA.

## Step 4: Install on Apple TV (tvOS)

Apple TV is more restrictive. You have these options:

### Option A: Apple Configurator (macOS)

1. Download **Apple Configurator 2** from the Mac App Store (free)
2. Connect your Apple TV via USB-C (or use WiFi if supported)
3. Create a new profile:
   - File → New Profile
   - Go to "Certificates" section
   - Click "+" and add your `ca.der` file
   - Save the profile
4. Install the profile on your Apple TV

### Option B: Xcode (for developers)

1. Open Xcode
2. Window → Devices and Simulators
3. Select your Apple TV
4. Use device management features to install the certificate

### Option C: MDM Solution

If you have an MDM solution (like Jamf, SimpleMDM, etc.), you can push the certificate profile to your Apple TV.

**Note:** Apple TV doesn't have a Settings app like iOS, so manual installation is not possible without these tools.

## Step 5: Test the Connection

1. **Restart Stremio** on your device
2. **Add your addon** using the HTTPS URL:
   ```
   https://YOUR_IP:7004/manifest.json
   ```
3. It should now connect **without certificate errors**!

## Troubleshooting

### "Certificate not found" error

Make sure you've generated the certificates:
```bash
npm run install-ca
```

### "OpenSSL not found" error

Install OpenSSL:
```bash
sudo apt-get install openssl
```

### Certificate still not trusted on iOS

1. Make sure you enabled "Full Trust" in Settings → General → About → Certificate Trust Settings
2. Try restarting your iOS device
3. Make sure the server certificate was signed by the CA (restart the server after generating the CA)

### Apple TV still shows errors

- Apple TV requires MDM or Apple Configurator - manual installation isn't possible
- Consider using Cloudflare Tunnel instead (see `IOS_APPLE_TV_CERTIFICATE_FIX.md`)

### Certificate expired

The server certificate is valid for 1 year. To regenerate:
```bash
# Delete old certificates
rm -rf certs/server.* certs/ca.srl

# Restart server (will auto-regenerate)
# Or manually:
npm run install-ca
```

## Security Notes

- **Keep your CA private key secure** (`certs/ca.key`) - anyone with this can create trusted certificates
- The CA certificate (`certs/ca.der`) is safe to share - it's public
- This setup is perfect for **home/private networks**
- For public servers, use Let's Encrypt instead

## Switching Back to Self-Signed

If you want to go back to the simple self-signed certificates:

```bash
# Delete CA certificates
rm -rf certs/ca.* certs/server.*

# The server will automatically fall back to self-signed certificates
```

## Advanced: Using a Domain Name

If you have a domain name, you can use it instead of an IP:

1. Point your domain to your Raspberry Pi's IP
2. Update `config.json`:
   ```json
   {
     "server": {
       "publicBaseUrl": "https://stremula.yourdomain.com:7004"
     }
   }
   ```
3. Regenerate certificates:
   ```bash
   npm run install-ca
   ```
4. The certificate will now include your domain name

This is better because:
- Domain names are more stable than IP addresses
- Easier to remember
- Can use Let's Encrypt for a fully trusted certificate

