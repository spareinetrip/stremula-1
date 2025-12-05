# Fixing Certificate Errors on iOS and Apple TV

## Understanding the Problem

**The Error:** "The certificate for this server is invalid. You might be connecting to a server that is pretending to be '87.67.70.58'"

**What it means:**
- iOS and Apple TV have **strict certificate validation** - they don't allow bypassing certificate warnings like browsers do
- Even if your self-signed certificate includes the correct IP address, iOS/Apple TV will **reject it** because it's not signed by a trusted Certificate Authority (CA)
- This is a **security feature** - Apple devices won't connect to servers with untrusted certificates

**Why it works in browsers but not iOS/Apple TV:**
- Browsers allow you to click "Advanced" → "Proceed anyway" to bypass the warning
- iOS/Apple TV apps **cannot bypass** certificate validation - they require a properly signed certificate

## Solutions

### ✅ Solution 1: Cloudflare Tunnel (Recommended - FREE)

Cloudflare Tunnel (formerly Argo Tunnel) provides a **free HTTPS endpoint** with a **valid SSL certificate** that iOS/Apple TV will trust.

#### Setup Steps:

1. **Install Cloudflare Tunnel on your Raspberry Pi:**
   ```bash
   # Download cloudflared
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
   # Or for 32-bit ARM:
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm
   
   # Make it executable
   chmod +x cloudflared-linux-arm64
   sudo mv cloudflared-linux-arm64 /usr/local/bin/cloudflared
   ```

2. **Authenticate with Cloudflare:**
   ```bash
   cloudflared tunnel login
   ```
   This will open a browser window - log in with your Cloudflare account (create one for free at cloudflare.com)

3. **Create a tunnel:**
   ```bash
   cloudflared tunnel create stremula
   ```

4. **Create a config file:**
   ```bash
   sudo mkdir -p /etc/cloudflared
   sudo nano /etc/cloudflared/config.yml
   ```
   
   Add this content (replace `YOUR_TUNNEL_ID` with the ID from step 3):
   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: /home/pi/.cloudflared/YOUR_TUNNEL_ID.json
   
   ingress:
     - hostname: stremula.YOUR_DOMAIN.com
       service: http://localhost:7003
     - service: http_status:404
   ```

5. **Add DNS record in Cloudflare dashboard:**
   - Go to your Cloudflare dashboard
   - Select your domain
   - Go to DNS → Records
   - Add a CNAME record:
     - Name: `stremula` (or whatever subdomain you want)
     - Target: `YOUR_TUNNEL_ID.cfargotunnel.com`
     - Proxy: Enabled (orange cloud)

6. **Run the tunnel:**
   ```bash
   cloudflared tunnel run stremula
   ```

7. **Create a systemd service (optional, for auto-start):**
   ```bash
   sudo nano /etc/systemd/system/cloudflared.service
   ```
   
   Add:
   ```ini
   [Unit]
   Description=Cloudflare Tunnel
   After=network.target
   
   [Service]
   Type=simple
   User=pi
   ExecStart=/usr/local/bin/cloudflared tunnel run stremula
   Restart=on-failure
   RestartSec=5
   
   [Install]
   WantedBy=multi-user.target
   ```
   
   Enable and start:
   ```bash
   sudo systemctl enable cloudflared
   sudo systemctl start cloudflared
   ```

8. **Update your config.json:**
   ```json
   {
     "server": {
       "port": 7003,
       "publicBaseUrl": "https://stremula.YOUR_DOMAIN.com"
     }
   }
   ```

9. **Use the Cloudflare URL in Stremio:**
   ```
   https://stremula.YOUR_DOMAIN.com/manifest.json
   ```

**Benefits:**
- ✅ Free
- ✅ Valid SSL certificate (iOS/Apple TV will trust it)
- ✅ No port forwarding needed
- ✅ Works from anywhere
- ✅ Automatic HTTPS

---

### ✅ Solution 2: ngrok (Alternative - FREE with limitations)

ngrok provides a free HTTPS tunnel, but the free tier has limitations (random URLs, connection limits).

1. **Install ngrok:**
   ```bash
   wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
   tar xvzf ngrok-v3-stable-linux-arm64.tgz
   sudo mv ngrok /usr/local/bin/
   ```

2. **Sign up at ngrok.com** and get your authtoken

3. **Authenticate:**
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

4. **Start tunnel:**
   ```bash
   ngrok http 7003
   ```

5. **Use the HTTPS URL** ngrok provides (e.g., `https://abc123.ngrok.io/manifest.json`)

**Note:** Free tier gives you a random URL that changes each time you restart ngrok.

---

### ✅ Solution 3: Let's Encrypt with Domain Name

If you have a domain name, you can use Let's Encrypt to get a free, valid SSL certificate.

1. **Point your domain to your Raspberry Pi's IP**
2. **Install certbot:**
   ```bash
   sudo apt-get update
   sudo apt-get install certbot
   ```

3. **Get certificate:**
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com
   ```

4. **Update your server to use the Let's Encrypt certificates** (requires modifying server.js to load the certs from `/etc/letsencrypt/live/yourdomain.com/`)

This is more complex but gives you a permanent solution.

---

### ❌ Solution 4: Manual Certificate Installation (Not Recommended)

You can try to manually install the self-signed certificate on iOS/Apple TV, but this is:
- Very difficult to do
- May not work for all apps
- Requires physical access to the device
- Not a reliable solution

**Steps (if you want to try):**
1. Export your certificate from the Pi
2. Email it to yourself
3. Open on iOS device
4. Go to Settings → General → About → Certificate Trust Settings
5. Enable trust for the certificate

**This often doesn't work** because Stremio may not respect the system certificate trust settings.

---

## Recommended Approach

**For most users:** Use **Cloudflare Tunnel (Solution 1)** - it's free, reliable, and provides a valid certificate that iOS/Apple TV will trust.

**If you have a domain:** Use **Let's Encrypt (Solution 3)** for a permanent, professional solution.

**For quick testing:** Use **ngrok (Solution 2)** but be aware of the limitations.

---

## Why This Happens

iOS and Apple TV use **App Transport Security (ATS)** which requires:
- Valid SSL certificates from trusted CAs
- TLS 1.2 or higher
- Proper certificate chain

Self-signed certificates don't meet these requirements, so iOS/Apple TV reject them. This is by design for security.

---

## Testing

After setting up Cloudflare Tunnel or another solution, test the connection:

```bash
# From your iOS device or any computer
curl https://stremula.YOUR_DOMAIN.com/manifest.json
```

You should get JSON output without any certificate errors.

Then add the addon in Stremio using:
```
https://stremula.YOUR_DOMAIN.com/manifest.json
```

iOS and Apple TV should now accept the connection without errors!

