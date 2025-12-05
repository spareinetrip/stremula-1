# Raspberry Pi Setup Guide for Stremula 1

This guide will walk you through setting up your Raspberry Pi and installing Stremula 1 from scratch.

## 📋 Prerequisites

- Raspberry Pi (any model with network connectivity)
- MicroSD card (8GB minimum, 16GB+ recommended)
- Power supply for your Raspberry Pi
- Network connection (Ethernet or WiFi)
- A computer (Mac, Windows, or Linux) to connect from

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
   # Scan your local network
   arp -a | grep -i "b8:27:eb\|dc:a6:32\|e4:5f:01"
   ```

   **Method C: Connect a monitor/keyboard**
   - Open Terminal on the Pi
   - Type: `hostname -I` to see the IP address

---

## Part 2: Connecting to Your Raspberry Pi

### On macOS (your current computer):

Open Terminal (Applications → Utilities → Terminal) and use SSH:

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

Once connected via SSH, run:

```bash
# Update package lists
sudo apt update

# Upgrade installed packages
sudo apt upgrade -y

# Install essential tools
sudo apt install -y git curl wget
```

### Step 2: Install Node.js

Stremula 1 requires Node.js version 16 or higher. Install it:

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

## Part 4: Downloading the Project from GitHub

### Using Git (Recommended)

On your Raspberry Pi (via SSH):

```bash
# Navigate to home directory
cd ~

# Clone the repository (replace with your actual GitHub repo URL)
git clone https://github.com/YOUR_USERNAME/stremula-1.git

# Navigate into the project directory
cd stremula-1
```

**Note:** Replace `https://github.com/YOUR_USERNAME/stremula-1.git` with your actual GitHub repository URL.

**✅ Git remote automatically configured:** Using `git clone` automatically sets up the git remote, which means the auto-updater will work immediately without any additional setup.

### Alternative: Using SCP (if you prefer manual transfer)

If you haven't pushed your project to GitHub yet, you can copy it manually:

From your **Mac Terminal** (not connected to Pi), navigate to your project directory and copy files:

```bash
# Make sure you're in the directory containing 'stremula-1'
cd "/Users/julien/Stremula 1"

# Copy the entire stremula-1 folder to your Pi
# Replace 192.168.1.100 with your Pi's IP
# Replace 'pi' with your username if different
scp -r stremula-1 pi@192.168.1.100:~/
```

**Important Note:** If you use SCP or download the project as a ZIP file (instead of `git clone`), the git remote will NOT be automatically configured. The auto-updater requires a git remote to check for updates. To set it up:

```bash
# On your Raspberry Pi, navigate to the project
cd ~/stremula-1

# Initialize git repository (if not already a git repo)
git init

# Add the remote (replace with your actual GitHub repo URL)
git remote add origin https://github.com/YOUR_USERNAME/stremula-1.git

# Verify it was added
git remote -v
```

**Recommendation:** Using `git clone` (the first method) is recommended because it automatically sets up the remote, making the auto-updater work immediately.

**Enter your password when prompted.**

### Alternative: Using SFTP Client (GUI method)

1. Download **FileZilla** or **Cyberduck** (free SFTP clients)
2. Connect to your Pi:
   - Host: `sftp://192.168.1.100` (your Pi's IP)
   - Username: `pi`
   - Password: your Pi password
   - Port: `22`
3. Drag and drop the `stremula-1` folder to your Pi's home directory

---

## Part 5: Installing and Configuring Stremula 1

### Step 1: Navigate to Project Directory

If you used Git clone, you should already be in the project directory. If not, navigate to it:

On your Raspberry Pi (via SSH):

```bash
cd ~/stremula-1
```

### Step 2: Install Dependencies

```bash
npm install
```

This will take a few minutes. Wait for it to complete.

### Step 3: Configure the Addon

Edit the configuration file:

```bash
nano config.json
```

**Fill in your credentials:**
- Replace `YOUR_REAL_DEBRID_API_KEY` with your Real Debrid API key
- Replace all Reddit credentials with your actual values
- Set `publicBaseUrl` to your Pi's IP address (e.g., `"http://192.168.1.100:7003"`)

**To save in nano:**
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

### Step 4: Test the Installation

Run both services to make sure everything works:

```bash
npm start
```

You should see output from both services:
- **SERVER** (blue output) - Database initialization and server startup messages
- **FETCHER** (green output) - Fetcher service startup and initial fetch

Example output:
```
[SERVER] ✅ Database initialized
[SERVER] 🌐 HTTP server running on port 7003 (localhost only)
[SERVER] 🔒 HTTPS server running on port 7004 (for IP access)
[FETCHER] ✅ Database initialized for fetcher service
[FETCHER] 🚀 Running initial fetch...
```

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

**Paste this content** (adjust the path if your project is elsewhere):

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

**Paste this content** (adjust the path if your project is elsewhere):

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

Save and exit (`Ctrl + X`, `Y`, `Enter`).

Create the fetcher service:

```bash
sudo nano /etc/systemd/system/stremula-fetcher.service
```

**Paste this content**:

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

```bash
cd ~/stremula-1

# Fetch all 24 weekends (full season)
npm run fetch24p
```

This will take some time as it processes all the weekends.

---

## Part 8: Installing in Stremio

1. **Open Stremio** on your device (phone, computer, TV, etc.)
2. **Go to Addons** → **Community Addons**
3. **Click the "+" button**
4. **Enter your addon URL:**
   ```
   http://YOUR_PI_IP:7003/manifest.json
   ```
   Replace `YOUR_PI_IP` with your Raspberry Pi's IP address (e.g., `192.168.1.100`)

5. **Click "Install"**

The addon should now appear in your Stremio library!

---

## 🔧 Useful Commands Reference

### Managing Services

**If using separate services (Option B):**

```bash
# Start services
sudo systemctl start stremula-server
sudo systemctl start stremula-fetcher

# Stop services
sudo systemctl stop stremula-server
sudo systemctl stop stremula-fetcher

# Restart services
sudo systemctl restart stremula-server
sudo systemctl restart stremula-fetcher

# Check status
sudo systemctl status stremula-server
sudo systemctl status stremula-fetcher

# View logs
sudo journalctl -u stremula-server -f
sudo journalctl -u stremula-fetcher -f
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

```bash
cd ~/stremula-1

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
   - Verify npm path: `which npm` (should be `/usr/bin/npm` for single service option)

3. **Check permissions:**
   ```bash
   # Make sure the pi user owns the directory
   sudo chown -R pi:pi ~/stremula-1
   ```

### Can't access from Stremio

1. **Check firewall:**
   ```bash
   # Allow port 7003
   sudo ufw allow 7003
   ```

2. **Verify server is running:**
   ```bash
   curl http://localhost:7003/manifest.json
   ```

3. **Check publicBaseUrl in config.json:**
   - Should be set to your Pi's IP: `"http://192.168.1.100:7003"`

---

## 📝 Next Steps

- Your Stremula 1 addon is now running 24/7 on your Raspberry Pi!
- The fetcher service will automatically check for new F1 posts every 15 minutes
- The server is always ready to serve content to Stremio
- You can safely disconnect from SSH - the services will keep running

**Enjoy your F1 replays! 🏎️**

