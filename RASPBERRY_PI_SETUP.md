# Raspberry Pi Setup Guide for Stremula 1

Complete setup guide for running Stremula 1 on Raspberry Pi with automatic startup and easy access via Stremio.

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

## Part 4: Downloading the Project

### Choosing Installation Location

**Option A: Home Directory (`~/stremula-1`)** - **Simpler**
- ✅ No permission issues
- ✅ Easy to manage
- ❌ Can clutter home directory if you run many services

**Option B: `/opt/stremula-1`** - **Recommended for multiple services**
- ✅ Standard Linux location for optional software
- ✅ Keeps home directory clean
- ✅ Better organization
- ⚠️ Requires `sudo` for installation

**Recommendation:** If you plan to run multiple services, use `/opt`. Otherwise, home directory is fine.

### Using Git (Recommended)

**Option A: Install in Home Directory**

```bash
# Navigate to home directory
cd ~

# Clone the repository (replace with your actual GitHub repo URL)
git clone https://github.com/YOUR_USERNAME/stremula-1.git

# Navigate into the project directory
cd stremula-1
```

**Option B: Install in /opt**

```bash
# Clone to /opt (requires sudo)
sudo git clone https://github.com/YOUR_USERNAME/stremula-1.git /opt/stremula-1

# Fix ownership so you can manage it without sudo
sudo chown -R $USER:$USER /opt/stremula-1

# Navigate into the project directory
cd /opt/stremula-1
```

**Note:** Replace `https://github.com/YOUR_USERNAME/stremula-1.git` with your actual GitHub repository URL.

**⚠️ Important:** If you install in `/opt`, remember to update the `WorkingDirectory` path in the systemd service files (Part 6) from `/home/pi/stremula-1` to `/opt/stremula-1`.

---

## Part 5: Installing and Configuring Stremula 1

### Step 1: Navigate to Project Directory

**If installed in home directory:**
```bash
cd ~/stremula-1
```

**If installed in /opt:**
```bash
cd /opt/stremula-1
```

### Step 2: Install Dependencies

```bash
npm install
```

This will take a few minutes. Wait for it to complete.

### Step 3: Generate Configuration File

The `config.json` file is automatically created on first run:

```bash
# Run the server briefly to generate config.json
# Press Ctrl+C after a few seconds to stop it
npm start
```

Wait a few seconds, then press `Ctrl + C` to stop the services.

### Step 4: Configure the Addon

Edit the configuration file:

```bash
nano config.json
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
- Leave `publicBaseUrl` empty for now (or set to Localtunnel URL if using it)

**To save in nano:**
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

### Step 5: Test the Installation

```bash
npm start
```

You should see output from both services:
- **SERVER** - Database initialization and server startup messages
- **FETCHER** - Fetcher service startup and initial fetch

**Press `Ctrl + C` to stop both services** (we'll set them up to run automatically next).

---

## Part 6: Running Stremula 1 Automatically

You want Stremula 1 to start automatically when your Pi boots. We'll use systemd (the service manager).

You have two options: a single service that runs both components, or separate services for better monitoring. We recommend **Option B (separate services)** for production use.

### Option A: Single Service (Simpler)

This runs both the server and fetcher together in one service:

```bash
sudo nano /etc/systemd/system/stremula.service
```

**Paste this content** (adjust the path based on where you installed):

**If installed in home directory (`~/stremula-1`):**
```ini
[Unit]
Description=Stremula 1 (Server + Fetcher)
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/stremula-1
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**If installed in `/opt/stremula-1`:**
```ini
[Unit]
Description=Stremula 1 (Server + Fetcher)
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

Then enable and start:

```bash
# Reload systemd to recognize new service
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable stremula

# Start the service now
sudo systemctl start stremula
```

**Check status:**
```bash
sudo systemctl status stremula
```

**View logs:**
```bash
sudo journalctl -u stremula -f
```

### Option B: Separate Services (Recommended for Production)

This creates separate services for the server and fetcher, allowing independent monitoring and control:

**Step 1: Create Service Files**

Create the server service:

```bash
sudo nano /etc/systemd/system/stremula-server.service
```

**Paste this content** (adjust the path based on where you installed):

**If installed in home directory (`~/stremula-1`):**
```ini
[Unit]
Description=Stremula 1 Stremio Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/stremula-1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**If installed in `/opt/stremula-1`:**
```ini
[Unit]
Description=Stremula 1 Stremio Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/stremula-1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Save and exit.

Create the fetcher service:

```bash
sudo nano /etc/systemd/system/stremula-fetcher.service
```

**Paste this content** (adjust the path based on where you installed):

**If installed in home directory (`~/stremula-1`):**
```ini
[Unit]
Description=Stremula 1 Fetcher Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/stremula-1
ExecStart=/usr/bin/node fetcher-service.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**If installed in `/opt/stremula-1`:**
```ini
[Unit]
Description=Stremula 1 Fetcher Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/stremula-1
ExecStart=/usr/bin/node fetcher-service.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Note:** Replace `pi` with your actual username if different.

Save and exit.

**Step 2: Enable and Start Services**

```bash
# Reload systemd to recognize new services
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable stremula-server
sudo systemctl enable stremula-fetcher

# Start the services now
sudo systemctl start stremula-server
sudo systemctl start stremula-fetcher
```

**Step 3: Check Service Status**

```bash
# Check server status
sudo systemctl status stremula-server

# Check fetcher status
sudo systemctl status stremula-fetcher
```

You should see `active (running)` in green for both services.

**To view logs:**
```bash
# Server logs
sudo journalctl -u stremula-server -f

# Fetcher logs
sudo journalctl -u stremula-fetcher -f

# Press Ctrl + C to exit log view
```

**Why choose separate services?**
- Monitor each service independently
- Restart services individually if needed
- See separate logs for easier debugging
- Better control over each component

---

## Part 7: Backfilling Historical Data (Optional)

To populate your database with past F1 weekends:

**If installed in home directory:**
```bash
cd ~/stremula-1
```

**If installed in /opt:**
```bash
cd /opt/stremula-1
```

Then run:
```bash
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

## Part 8: Installing in Stremio

**⚠️ Important:** Stremio requires HTTPS for network access. HTTP only works for localhost. For all network access (local network and public web), use Localtunnel.

### Option A: Localhost Access (Same Device Only)

If you're running Stremio on the same Raspberry Pi:

1. Open Stremio on your Pi
2. Go to **Addons** → **Community Addons**
3. Click the **"+"** button
4. Enter: `http://localhost:7003/manifest.json`
5. Click **"Install"**

**Note:** This only works when Stremio and the server are on the same device.

### Option B: Network Access via Localtunnel (Recommended)

**Use Localtunnel for all network access** - local network, public web, Stremio Desktop, and Stremio Web. Localtunnel provides HTTPS with valid certificates - no warnings, works everywhere.

**🔒 Benefits:**
- ✅ **No certificate warnings** - Valid SSL certificates (Let's Encrypt)
- ✅ **Works everywhere** - Stremio Desktop, Stremio Web, iOS, Android
- ✅ **No port forwarding** - Works behind any router/NAT
- ✅ **No firewall config** - No need to open ports
- ✅ **Free and easy** - No signup required
- ✅ **Works on local network** - Access from any device on your WiFi
- ✅ **Works on public web** - Access from anywhere

**Setup Steps:**

1. **Install Localtunnel:**
   ```bash
   sudo npm install -g localtunnel
   ```

2. **Start your Stremula server** (if not already running):
   ```bash
   # If using systemd, it should already be running
   # If not, start it:
   sudo systemctl start stremula-server
   # or if using single service:
   sudo systemctl start stremula
   ```

3. **Start the tunnel** in a separate terminal:
   ```bash
   lt --port 7003
   ```

4. **You'll see output like:**
   ```
   your url is: https://random-name.loca.lt
   ```

5. **Update config.json** (recommended for media URLs):
   ```bash
   # If in home directory:
   nano ~/stremula-1/config.json
   
   # If in /opt:
   nano /opt/stremula-1/config.json
   ```
   Set `publicBaseUrl` to your tunnel URL:
   ```json
   "server": {
     "port": 7003,
     "publicBaseUrl": "https://random-name.loca.lt"
   }
   ```
   Save and restart the server if needed.

6. **Add to Stremio:**
   - Open Stremio (Desktop or Web)
   - Go to **Addons** → **Community Addons**
   - Click the **"+"** button
   - Enter: `https://random-name.loca.lt/manifest.json`
   - Click **"Install"**

**Running Localtunnel as a Systemd Service (Recommended for Production):**

For permanent access that starts automatically, run Localtunnel as a systemd service:

```bash
sudo nano /etc/systemd/system/stremula-tunnel.service
```

Paste:
```ini
[Unit]
Description=Stremula 1 Localtunnel
After=network.target stremula-server.service
Requires=stremula-server.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi
ExecStart=/usr/bin/lt --port 7003
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Note:** Adjust paths and username as needed. The tunnel URL will still change on restart, but it will automatically restart with the server.

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable stremula-tunnel
sudo systemctl start stremula-tunnel
```

**Note:** The tunnel URL changes each time you restart it. For a permanent URL, consider using a paid tunneling service or setting up your own domain with HTTPS.

---

## 🔧 Useful Commands Reference

### Managing Services

**If using separate services (Option B):**

```bash
# Start services
sudo systemctl start stremula-server
sudo systemctl start stremula-fetcher
sudo systemctl start stremula-tunnel  # If using Localtunnel service

# Stop services
sudo systemctl stop stremula-server
sudo systemctl stop stremula-fetcher
sudo systemctl stop stremula-tunnel

# Restart services
sudo systemctl restart stremula-server
sudo systemctl restart stremula-fetcher
sudo systemctl restart stremula-tunnel

# Check status
sudo systemctl status stremula-server
sudo systemctl status stremula-fetcher
sudo systemctl status stremula-tunnel

# View logs
sudo journalctl -u stremula-server -f
sudo journalctl -u stremula-fetcher -f
sudo journalctl -u stremula-tunnel -f  # To see the tunnel URL
```

**If using single service (Option A):**

```bash
# Start service
sudo systemctl start stremula

# Stop service
sudo systemctl stop stremula

# Restart service
sudo systemctl restart stremula

# Check status
sudo systemctl status stremula

# View logs
sudo journalctl -u stremula -f
```

### Updating Your Project

If you make changes to the code on GitHub:

**If installed in home directory:**
```bash
cd ~/stremula-1
```

**If installed in /opt:**
```bash
cd /opt/stremula-1
```

Then run:
```bash
# Pull latest changes from GitHub
git pull

# Reinstall dependencies (if package.json changed)
npm install

# Restart services
# If using separate services:
sudo systemctl restart stremula-server
sudo systemctl restart stremula-fetcher

# If using single service:
sudo systemctl restart stremula
```

### Finding Your Pi's IP Address

```bash
# On the Pi
hostname -I
```

### Testing the Server

```bash
# From your Mac or any device on the network
curl http://YOUR_PI_IP:7003/manifest.json

# Health check
curl http://YOUR_PI_IP:7003/health
```

---

## 🐛 Troubleshooting

### Can't connect via SSH

1. **Check if SSH is enabled:**
   - If you have a monitor/keyboard connected, run: `sudo systemctl enable ssh`
   - Or re-flash the SD card with SSH enabled in Raspberry Pi Imager

2. **Check your Pi's IP address:**
   - Connect a monitor and run: `hostname -I`

3. **Check if Pi is on the same network:**
   - Both your computer and Pi must be on the same WiFi/Ethernet network

### Services won't start

1. **Check the logs:**
   ```bash
   # If using separate services:
   sudo journalctl -u stremula-server -n 50
   sudo journalctl -u stremula-fetcher -n 50
   
   # If using single service:
   sudo journalctl -u stremula -n 50
   ```

2. **Check file paths:**
   - Make sure the `WorkingDirectory` in service files matches where you installed the project
   - Verify Node.js path: `which node` (should be `/usr/bin/node`)

3. **Check permissions:**
   ```bash
   # Make sure the pi user owns the directory
   # If in home directory:
   sudo chown -R pi:pi ~/stremula-1
   
   # If in /opt:
   sudo chown -R pi:pi /opt/stremula-1
   ```
   (Replace `pi` with your actual username)

### Can't access from Stremio

1. **Verify server is running:**
   ```bash
   curl http://localhost:7003/manifest.json
   ```

2. **Check Localtunnel is running:**
   ```bash
   sudo systemctl status stremula-tunnel
   # Or if running manually, check the terminal output for the URL
   ```

3. **Check publicBaseUrl in config.json:**
   - Should be set to your Localtunnel URL: `https://random-name.loca.lt`
   - Get the URL from tunnel logs: `sudo journalctl -u stremula-tunnel -n 20`

### Localtunnel not working

1. **Make sure server is running:**
   ```bash
   sudo systemctl status stremula-server
   ```

2. **Check if port 7003 is accessible:**
   ```bash
   curl http://localhost:7003/health
   ```

3. **Try restarting the tunnel:**
   ```bash
   # Stop tunnel
   sudo systemctl stop stremula-tunnel
   
   # Start tunnel
   sudo systemctl start stremula-tunnel
   
   # Check logs
   sudo journalctl -u stremula-tunnel -f
   ```

---

## 📝 Next Steps

- Your Stremula 1 addon is now running 24/7 on your Raspberry Pi!
- The fetcher service will automatically check for new F1 posts every 15 minutes
- The server is always ready to serve content to Stremio
- You can safely disconnect from SSH - the services will keep running

**Enjoy your F1 replays! 🏎️**
