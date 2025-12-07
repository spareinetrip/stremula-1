# Raspberry Pi Setup Guide for Stremula 1

Complete setup guide for running Stremula 1 on Raspberry Pi with automatic startup and Localtunnel integration.

## 📋 Prerequisites

- Raspberry Pi (any model with network connectivity)
- MicroSD card (8GB minimum, 16GB+ recommended)
- Power supply for your Raspberry Pi
- Network connection (Ethernet or WiFi)
- A computer to connect from

---

## Part 1: Initial Raspberry Pi Setup

### Step 1: Install Raspberry Pi OS

1. **Download Raspberry Pi Imager** from [raspberrypi.com/software](https://www.raspberrypi.com/software/)
2. **Insert your microSD card** into your computer
3. **Open Raspberry Pi Imager** and:
   - Click "Choose OS" → Select "Raspberry Pi OS (recommended)"
   - Click "Choose Storage" → Select your microSD card
   - Click the gear icon (⚙️) to open advanced options:
     - ✅ Enable SSH
     - Set username: `pi` (or your preferred username)
     - Set password: Choose a secure password
     - ✅ Configure WiFi (if using WiFi) - enter your network name and password
     - Set locale settings (timezone, keyboard layout)
   - Click "Save"
   - Click "Write" to flash the OS to the SD card

### Step 2: First Boot

1. **Insert the microSD card** into your Raspberry Pi
2. **Connect power** to your Raspberry Pi
3. **Wait 1-2 minutes** for the Pi to boot up
4. **Find your Pi's IP address** using one of these methods:

   **Method A: From your router**
   - Log into your router's admin page (usually `192.168.1.1` or `192.168.0.1`)
   - Look for connected devices named "raspberrypi"

   **Method B: Using network scanner (from your Mac)**
   ```bash
   arp -a | grep -i "b8:27:eb\|dc:a6:32\|e4:5f:01"
   ```

   **Method C: Connect a monitor/keyboard**
   - Open Terminal on the Pi
   - Type: `hostname -I` to see the IP address

---

## Part 2: Connecting to Your Raspberry Pi

### On macOS:

Open Terminal and use SSH:

```bash
# Replace 192.168.1.100 with your Pi's actual IP address
# Replace 'pi' with your username if different
ssh pi@192.168.1.100
```

**First time connection:**
- You'll see a message about authenticity - type `yes` and press Enter
- Enter your password (the one you set in Raspberry Pi Imager)

**You're now connected!** You should see a prompt like:
```
pi@raspberrypi:~ $
```

---

## Part 3: Setting Up Your Raspberry Pi

### Step 1: Update the System

```bash
# Update package lists
sudo apt update

# Upgrade installed packages
sudo apt upgrade -y

# Install essential tools
sudo apt install -y git curl wget
```

### Step 2: Install Node.js

Stremula 1 requires Node.js version 16 or higher:

```bash
# Install Node.js 20.x (LTS version)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

You should see versions like `v20.x.x` and `10.x.x`.

---

## Part 4: Installing Stremula 1

### Step 1: Clone the Repository

```bash
# Clone to /opt (standard location for optional software)
sudo git clone https://github.com/YOUR_USERNAME/stremula-1.git /opt/stremula-1

# Fix ownership so you can manage it without sudo
sudo chown -R $USER:$USER /opt/stremula-1

# Navigate into the project directory
cd /opt/stremula-1
```

**Note:** Replace `https://github.com/YOUR_USERNAME/stremula-1.git` with your actual GitHub repository URL.

### Step 2: Install Dependencies

```bash
cd /opt/stremula-1
npm install
```

This will take a few minutes. Wait for it to complete.

### Step 3: Install Localtunnel

```bash
sudo npm install -g localtunnel
```

### Step 4: Generate Configuration File

The `config.json` file is automatically created on first run:

```bash
# Run the server briefly to generate config.json
# Press Ctrl+C after a few seconds to stop it
npm start
```

Wait a few seconds, then press `Ctrl + C` to stop the services.

### Step 5: Configure the Addon

Edit the configuration file:

```bash
nano /opt/stremula-1/config.json
```

**Fill in your credentials:**
- Replace the empty `apiKey` value with your Real Debrid API key
- Replace all empty Reddit credential values with your actual values:
  - `clientId`: Your Reddit app client ID
  - `clientSecret`: Your Reddit app client secret
  - `username`: Your Reddit username
  - `password`: Your Reddit password
  - `userAgent`: Should match your Reddit username (e.g., `"Stremula1/3.0 (by u/yourusername)"`)
- Set `realdebrid.enabled` to `true`
- **Leave `publicBaseUrl` empty** - it will be automatically updated by the tunnel service

**To save in nano:**
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

### Step 6: Test the Installation

```bash
npm start
```

You should see output from both services:
- **SERVER** - Database initialization and server startup messages
- **FETCHER** - Fetcher service startup and initial fetch

**Press `Ctrl + C` to stop both services** (we'll set them up to run automatically next).

---

## Part 5: Setting Up Automatic Startup

We'll create a single systemd service that runs everything together.

### Step 1: Create the Service File

```bash
sudo nano /etc/systemd/system/stremula.service
```

**Paste this content:**

```ini
[Unit]
Description=Stremula 1 (Server + Fetcher + Tunnel)
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/stremula-1
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Note:** Replace `pi` with your actual username if different.

Save and exit (`Ctrl + X`, `Y`, `Enter`).

### Step 2: Create the Tunnel Service

```bash
sudo nano /etc/systemd/system/stremula-tunnel.service
```

**Paste this content:**

```ini
[Unit]
Description=Stremula 1 Localtunnel
After=network.target stremula.service
Requires=stremula.service

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/stremula-1
ExecStart=/usr/bin/node start-tunnel.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Note:** Replace `pi` with your actual username if different.

Save and exit.

### Step 3: Enable and Start Services

```bash
# Reload systemd to recognize new services
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable stremula
sudo systemctl enable stremula-tunnel

# Start the services now
sudo systemctl start stremula
sudo systemctl start stremula-tunnel
```

### Step 4: Check Service Status

```bash
# Check main service status
sudo systemctl status stremula

# Check tunnel service status
sudo systemctl status stremula-tunnel
```

You should see `active (running)` in green for both services.

**To view logs:**
```bash
# Main service logs
sudo journalctl -u stremula -f

# Tunnel service logs (to see your tunnel URL)
sudo journalctl -u stremula-tunnel -f

# Press Ctrl + C to exit log view
```

**To get your tunnel URL:**
```bash
sudo journalctl -u stremula-tunnel -n 50 | grep "https://"
```

The tunnel URL will be automatically saved to `config.json`. Your unique subdomain will be something like `stremula-1-raspberrypi-abc123.loca.lt`.

---

## Part 6: Installing in Stremio

### Get Your Tunnel URL

The tunnel service automatically creates a unique URL for your installation. To find it:

```bash
# View recent tunnel logs
sudo journalctl -u stremula-tunnel -n 50 | grep "https://"
```

Or check your `config.json`:

```bash
cat /opt/stremula-1/config.json | grep publicBaseUrl
```

You'll see something like: `"publicBaseUrl": "https://stremula-1-raspberrypi-abc123.loca.lt"`

### Add to Stremio

1. **Open Stremio** (Desktop or Web)
2. **Go to Addons** → **Community Addons**
3. **Click the "+" button**
4. **Enter your tunnel URL:**
   ```
   https://stremula-1-raspberrypi-abc123.loca.lt/manifest.json
   ```
   (Replace with your actual tunnel URL)
5. **Click "Install"**

**That's it!** The addon is now accessible from anywhere with no certificate warnings.

---

## Part 7: Backfilling Historical Data (Optional)

To populate your database with past F1 weekends:

```bash
cd /opt/stremula-1

# Fetch any number of weekends (replace X with your desired number)
node cli.js --fetchXp

# Examples:
node cli.js --fetch1p    # Fetch 1 weekend
node cli.js --fetch5p    # Fetch 5 weekends
node cli.js --fetch24p   # Fetch all 24 weekends (full season)

# Or use convenience npm scripts:
npm run fetch1p
npm run fetch5p
npm run fetch24p
```

---

## 🔧 Useful Commands Reference

### Managing Services

```bash
# Start services (order matters: server first, then tunnel)
sudo systemctl start stremula
sudo systemctl start stremula-tunnel

# Stop services (order doesn't matter for stopping)
sudo systemctl stop stremula-tunnel
sudo systemctl stop stremula

# Restart services (IMPORTANT: restart server first, then tunnel)
sudo systemctl restart stremula
sudo systemctl restart stremula-tunnel

# Or restart both together (systemd will handle order automatically)
sudo systemctl restart stremula stremula-tunnel

# Check status
sudo systemctl status stremula
sudo systemctl status stremula-tunnel

# View logs
sudo journalctl -u stremula -f
sudo journalctl -u stremula-tunnel -f
```

**⚠️ Important:** When manually restarting services, always restart `stremula` first, then `stremula-tunnel`. The tunnel service needs the server to be running on port 7003 before it can connect. On system boot, systemd handles this automatically due to the `After` and `Requires` dependencies.

### Updating Your Project

```bash
cd /opt/stremula-1

# Pull latest changes from GitHub
git pull

# Reinstall dependencies (if package.json changed)
npm install

# Restart services (IMPORTANT: restart server first, then tunnel)
sudo systemctl restart stremula
sudo systemctl restart stremula-tunnel
```

### Finding Your Tunnel URL

```bash
# Method 1: From logs
sudo journalctl -u stremula-tunnel -n 50 | grep "https://"

# Method 2: From config file
cat /opt/stremula-1/config.json | grep publicBaseUrl

# Method 3: Check device ID
cat /opt/stremula-1/.device-id
# Then use: https://stremula-1-{device-id}.loca.lt/manifest.json
```

### Testing the Server

```bash
# Health check
curl http://localhost:7003/health

# Server info
curl http://localhost:7003/
```

---

## 🐛 Troubleshooting

### Services won't start

1. **Check the logs:**
   ```bash
   sudo journalctl -u stremula -n 50
   sudo journalctl -u stremula-tunnel -n 50
   ```

2. **Check file paths:**
   - Make sure the `WorkingDirectory` in service files is `/opt/stremula-1`
   - Verify Node.js path: `which node` (should be `/usr/bin/node`)

3. **Check permissions:**
   ```bash
   sudo chown -R $USER:$USER /opt/stremula-1
   ```
   (Replace `$USER` with your actual username)

### Tunnel not working

1. **Check if Localtunnel is installed:**
   ```bash
   which lt
   ```
   If not found: `sudo npm install -g localtunnel`

2. **Check if server is running:**
   ```bash
   curl http://localhost:7003/health
   ```

3. **Check tunnel logs:**
   ```bash
   sudo journalctl -u stremula-tunnel -f
   ```

4. **Check firewall:**
   ```bash
   sudo ufw status
   ```
   Localtunnel needs outbound connections - ufw should allow outgoing by default.

### Can't access from Stremio

1. **Verify tunnel URL:**
   ```bash
   cat /opt/stremula-1/config.json | grep publicBaseUrl
   ```

2. **Check tunnel is running:**
   ```bash
   sudo systemctl status stremula-tunnel
   ```

3. **Test tunnel URL:**
   ```bash
   curl https://YOUR_TUNNEL_URL/manifest.json
   ```

### Config.json syntax errors

If you see `SyntaxError: Expected ',' or '}'`:
- Check for extra quotes or commas in `config.json`
- Validate JSON: `cat /opt/stremula-1/config.json | python3 -m json.tool`
- Fix any syntax errors and restart: `sudo systemctl restart stremula`

---

## 📝 Next Steps

- Your Stremula 1 addon is now running 24/7 on your Raspberry Pi!
- The fetcher service will automatically check for new F1 posts every 15 minutes
- The server is always ready to serve content to Stremio
- The tunnel provides HTTPS access from anywhere with no certificate warnings
- You can safely disconnect from SSH - the services will keep running

**Enjoy your F1 replays! 🏎️**
