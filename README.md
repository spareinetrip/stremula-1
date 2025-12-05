# Stremula 1 - Formula 1 Addon for Stremio

High-quality Sky Sports F1 replays with Real Debrid integration, optimized for Raspberry Pi with persistent database storage.

## 🚀 Features

- **Real Debrid Integration**: Direct streaming links with instant playback
- **Reddit API Access**: Reliable, authenticated access to Formula 1 posts
- **Persistent Database**: SQLite database stores all weekends and streaming links
- **Smart Fetching**: Each fetch round stops when fully processed weekends are found, but the service continues running
- **Background Service**: Fetcher service runs every 15 minutes (configurable)
- **No Startup Delay**: Server runs constantly, always ready to serve content
- **Session Detection**: Automatically detects Practice, Qualifying, Sprint, and Race sessions
- **Quality Selection**: 4K and 1080p options when available
- **Automatic Year Overwrite**: When new season posts are found (e.g., 2026), old season posts (e.g., 2025) with the same Grand Prix name are automatically overwritten with fresh data
- **Smart Torrent Handling**: Prevents getting stuck on slow Real Debrid downloads with 1-minute timeout and automatic retry logic

## 📋 Requirements

### 1. Real Debrid Account (REQUIRED)
- Sign up at [real-debrid.com](https://real-debrid.com)
- Get your API token from [API Token page](https://real-debrid.com/apitoken)

### 2. Reddit API Credentials (REQUIRED)
The addon uses Reddit's official API to avoid blocking issues.

#### How to Get Reddit API Credentials:

1. **Create a Reddit App:**
   - Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
   - Click "Create App" or "Create Another App"
   - Choose **"script"** as the app type
   - Enter any name (e.g., "Stremula1")
   - Leave redirect URI empty
   - Click "Create app"

2. **Get Your Credentials:**
   - **Client ID**: The string under your app name (looks like: `abcd1234efgh5678`)
   - **Client Secret**: The "secret" field (longer string)
   - **Username**: Your Reddit username (without u/ prefix)
   - **Password**: Your Reddit password

### 3. Node.js (REQUIRED)
- Node.js version 16 or higher
- npm (comes with Node.js)

## ⚙️ Installation & Setup

### Step 0: Get the Project

**If you haven't already, download the project from GitHub:**

```bash
# Clone the repository (recommended)
git clone https://github.com/YOUR_USERNAME/stremula-1.git
cd stremula-1
```

**Note:** Using `git clone` automatically configures the git remote. If you download the project as a ZIP file or copy it manually, you'll need to set up the git remote manually if you want to use git features.

### Step 1: Install Dependencies

```bash
cd stremula-1
npm install
```

### Step 2: Generate Configuration File

The `config.json` file is automatically created on first run. You can generate it by running the app briefly:

```bash
# Run the server briefly to generate config.json
# Press Ctrl+C after a few seconds to stop it
npm start
```

Wait a few seconds, then press `Ctrl + C` to stop the services. The `config.json` file will now exist in the project directory.

**Note:** The config file is automatically created with default values when any service starts. If you prefer, you can create it manually, but the auto-generation is easier.

### Step 3: Configure the Plugin

Edit the `config.json` file and fill in your credentials:

```json
{
  "realdebrid": {
    "apiKey": "YOUR_REAL_DEBRID_API_KEY",
    "enabled": true
  },
  "reddit": {
    "clientId": "YOUR_REDDIT_CLIENT_ID",
    "clientSecret": "YOUR_REDDIT_CLIENT_SECRET",
    "username": "YOUR_REDDIT_USERNAME",
    "password": "YOUR_REDDIT_PASSWORD",
    "userAgent": "Stremula1/3.0 (by u/YOUR_REDDIT_USERNAME)"
  },
  "server": {
    "port": 7003
  },
  "fetcher": {
    "intervalMinutes": 15,
    "maxScrollMonths": 3
  }
}
```

**Important Notes:**
- The auto-generated config file will have empty values for credentials. Replace them with your actual values:
  - `realdebrid.apiKey`: Your Real Debrid API key
  - `realdebrid.enabled`: Set to `true` to enable Real Debrid
  - `reddit.clientId`: Your Reddit app client ID
  - `reddit.clientSecret`: Your Reddit app client secret
  - `reddit.username`: Your Reddit username
  - `reddit.password`: Your Reddit password
  - `reddit.userAgent`: Should match your Reddit username (e.g., if your username is `yourusername`, use `"Stremula1/3.0 (by u/yourusername)"`). This is required by Reddit's API.
- The `intervalMinutes` setting controls how often the fetcher checks for new posts (default: 15 minutes)

### Step 4: Initialize the Database

The database will be automatically created on first run. No manual setup needed!

## 🏃‍♂️ Running the Plugin

The plugin consists of two components that run simultaneously: the Stremio server and the fetcher service.

### Quick Start (Recommended)

Simply run:

```bash
npm start
```

This single command starts **both services** together:
- **SERVER** (blue output) - The Stremio server that serves content
- **FETCHER** (green output) - The background service that fetches new posts

The output will be color-coded so you can easily see which service is logging what.

**What each service does:**

**Stremio Server:**
- Starts HTTP server on port 7003 (or configured port) for local network access
- Serves content from the database
- Ready immediately (no startup delay)
- **Auto-restart on crashes**: Automatically restarts if it crashes (up to 5 restarts per minute)

**Fetcher Service:**
- Runs an initial fetch immediately
- Then fetches every 15 minutes (or your configured interval) continuously
- Each fetch round stops when it finds a fully processed weekend (both 1080p and 2160p posts fully processed)
- The service continues running and automatically schedules the next fetch
- Processes new posts and adds them to the database
- Handles errors gracefully without crashing the service
- **Auto-restart on crashes**: Automatically restarts if it crashes (up to 5 restarts per minute)

### Running Services Individually

If you need to run the services separately (for debugging, development, etc.):

**Server only:**
```bash
npm run server
# or
node server.js
```

**Fetcher only:**
```bash
npm run fetcher
# or
node fetcher-service.js
```

### Running in Production

For production deployments, here are some options:

#### Option 1: Using screen (Simple setup)

```bash
# Install screen if not already installed
sudo apt-get install screen

# Start both services in a screen session
screen -S stremula
npm start
# Press Ctrl+A then D to detach

# To reattach later:
screen -r stremula
```

#### Option 2: Using systemd (Best for production - provides additional restart protection)

**Note**: Both the server and fetcher now have built-in auto-restart functionality. Using systemd adds an extra layer of protection by restarting the processes even if the built-in restart mechanism fails.

You have two options for systemd:

**Option A: Single Service (Simpler)**

Create one systemd service file that runs both services:

**`/etc/systemd/system/stremula.service`:**
```ini
[Unit]
Description=Stremula 1 (Server + Fetcher)
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/path/to/stremula-1
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl enable stremula
sudo systemctl start stremula
```

**Option B: Separate Services (Better for monitoring)**

Create two systemd service files for independent control and monitoring:

**`/etc/systemd/system/stremula-server.service`:**
```ini
[Unit]
Description=Stremula 1 Stremio Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/path/to/stremula-1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/stremula-fetcher.service`:**
```ini
[Unit]
Description=Stremula 1 Fetcher Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/path/to/stremula-1
ExecStart=/usr/bin/node fetcher-service.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl enable stremula-server
sudo systemctl enable stremula-fetcher
sudo systemctl start stremula-server
sudo systemctl start stremula-fetcher
```

**Recommendation:** Option B (separate services) is recommended for production as it allows you to:
- Monitor each service independently
- Restart services individually if needed
- See separate logs for each service
- Better debugging capabilities

## 📥 Backfilling Historical Data

To fill your database with historical F1 weekends, use the CLI tool:

```bash
# Fetch any number of weekends (X can be any number)
node cli.js --fetchXp

# Examples:
node cli.js --fetch1p    # Fetch 1 weekend
node cli.js --fetch5p    # Fetch 5 weekends
node cli.js --fetch17p   # Fetch 17 weekends
node cli.js --fetch24p   # Fetch 24 weekends (full 2025 season)

# Convenience npm scripts (for common numbers):
npm run fetch1p   # Same as: node cli.js --fetch1p
npm run fetch5p   # Same as: node cli.js --fetch5p
npm run fetch24p  # Same as: node cli.js --fetch24p
```

**Note:** The normal fetcher service will stop each fetch round when it finds a fully processed weekend, but the service itself continues running and will automatically start the next fetch round after the configured interval. The CLI tool with `--fetchXp` will fetch a specific number of weekends regardless of processing status.

## 📡 Installing in Stremio

1. Open Stremio
2. Go to Addons → Community Addons
3. Click the "+" button
4. Enter your addon URL:
   - **Same device (localhost)**: `http://localhost:7003/manifest.json` or `http://127.0.0.1:7003/manifest.json`
   - **Local network (other devices)**: `http://YOUR_IP:7003/manifest.json` (replace YOUR_IP with your server's local IP address)

**Note:** The server uses HTTP only and is accessible on your local network. Make sure your device is on the same network as the server.

## 🌐 Connecting from Another Device on Your Local Network

The server runs on HTTP and is accessible on your local network. To access from another device (e.g., your phone, tablet, or another computer):

1. **Find your server's local IP address:**
   ```bash
   # On macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # On Windows
   ipconfig
   
   # On Raspberry Pi
   hostname -I
   ```
   Example: `192.168.1.118`

2. **Use the HTTP URL in Stremio:**
   ```
   http://192.168.1.118:7003/manifest.json
   ```
   (Replace with your actual IP address)

3. **Make sure both devices are on the same network:**
   - Both your server and the device running Stremio must be on the same WiFi/LAN network

### 🧪 Testing Your Connection

**Test from the same network:**
```bash
# Replace with your server's local IP
curl http://192.168.1.118:7003/manifest.json
```

If you see JSON output, the server is accessible!

## 🔧 Configuration Options

### config.json

- **realdebrid.apiKey**: Your Real Debrid API key (required)
- **realdebrid.enabled**: Set to `true` to enable Real Debrid (required)
- **reddit.clientId**: Reddit app client ID (required)
- **reddit.clientSecret**: Reddit app client secret (required)
- **reddit.username**: Your Reddit username (required)
- **reddit.password**: Your Reddit password (required)
- **server.port**: Port for the Stremio server (default: 7003)
- **fetcher.intervalMinutes**: How often to check for new posts (default: 15)
- **fetcher.maxScrollMonths**: How far back to search for posts (default: 3)

### Environment Variables

You can also use environment variables instead of config.json:

```bash
export REALDEBRID_API_KEY="your_key"
export REDDIT_CLIENT_ID="your_id"
export REDDIT_CLIENT_SECRET="your_secret"
export REDDIT_USERNAME="your_username"
export REDDIT_PASSWORD="your_password"
export PORT=7003
```

## 🗄️ Database

The plugin uses SQLite for storage. The database file is created at `stremula.db` in the plugin directory.

**Database Structure:**
- **processed_posts**: Tracks which Reddit posts have been processed, including torrent status and retry tracking
- **f1_weekends**: Stores F1 weekend information
- **sessions**: Stores individual session data (Practice, Qualifying, Race, etc.)
- **streaming_links**: Stores Real Debrid streaming links for each session

**Important:** The database is persistent, so processed posts won't be reprocessed. This means:
- Faster subsequent fetches
- No duplicate Real Debrid conversions
- Historical data is preserved
- Torrent download status is tracked to avoid retrying slow downloads

## 🔄 How It Works

1. **Fetcher Service** runs continuously, scheduling fetches every 15 minutes (configurable)
2. Each fetch round:
   - Fetches newest posts from u/egortech on Reddit
   - For each new F1 weekend post found:
     - Extracts year from post title (e.g., 2025, 2026, 2027)
     - **Year-Based Overwrite**: If processing a post from a new year (e.g., 2026), automatically deletes old weekends from the previous year (e.g., 2025) with the same Grand Prix name
       - This ensures the database always contains the latest season's data
       - Only deletes weekends from the previous year, never from the same year (safe for multiple posts per Grand Prix)
       - Future-proof: Works for any year transition (2025→2026, 2026→2027, etc.)
     - Extracts magnet link and session information
     - **Smart Torrent Handling**: 
       - Checks if the magnet link already exists in Real Debrid (reuses existing torrents)
       - If torrent exists and is downloaded → gets streaming links immediately
       - If torrent exists but is still downloading → checks status once, shows progress, and moves on (will check again next fetch)
       - If torrent doesn't exist → adds new torrent and waits up to 1 minute for download
       - If still downloading after 1 minute, saves the status and moves on (will check again on next fetch cycle)
       - On each fetch cycle, rechecks existing torrents to see if they've finished downloading
       - Tracks torrent status in the database and shows progress percentage
     - Saves everything to the database
   - Stops that fetch round when it finds a weekend that is fully processed (both 1080p and 2160p posts have all required sessions)
   - Returns normally and waits for the next scheduled fetch
3. **Service Continuity**: The fetcher service keeps running even after a fetch round completes, automatically scheduling the next fetch
4. **Server** serves content from the database in real-time
5. Posts are only marked as "fully processed" when ALL required sessions are found and converted

## 🔄 Auto-Restart Functionality

Both the server and fetcher service now include built-in auto-restart functionality to handle crashes and unexpected errors:

### How It Works

- **Automatic Recovery**: If either service crashes due to an unhandled exception or promise rejection, it will automatically restart
- **Smart Limiting**: To prevent infinite restart loops, the system limits restarts to:
  - Maximum 5 restarts per 60-second window
  - 5-second delay between restart attempts
- **Graceful Shutdown**: Before restarting, services gracefully shut down existing connections and cleanup resources
- **Configuration Errors**: Configuration errors (missing API keys, etc.) do not trigger auto-restart as these require manual intervention

### When Auto-Restart Helps

- Unhandled JavaScript exceptions
- Unhandled promise rejections  
- Unexpected runtime errors
- Memory-related crashes (Node.js will still restart)

### When Auto-Restart Doesn't Help

- Port conflicts (these are configuration issues, not crashes)
- Missing configuration files or API keys
- System-level issues (out of memory, disk full)
- Manual termination (Ctrl+C)

### Additional Protection

For production deployments, it's recommended to also use:
- **systemd** (Linux): Provides an additional layer of restart protection (already documented above)
- **PM2** (cross-platform): Another popular process manager that can work alongside the built-in restart mechanism

The built-in auto-restart works independently and provides immediate recovery, while systemd/PM2 provides additional protection for system-level failures.

## 🐛 Troubleshooting

### "Real Debrid not configured"
- Check that `realdebrid.apiKey` is set in `config.json`
- Verify the API key is correct at [real-debrid.com/apitoken](https://real-debrid.com/apitoken)

### "Reddit API not configured"
- Check that all Reddit credentials are set in `config.json`
- Verify your Reddit app is set to "script" type
- Test your credentials using the Reddit API directly

### "No posts found"
- Check Reddit API credentials are working
- Verify u/egortech is still posting Formula 1 content
- Check server logs for authentication errors

### Can't access from another device on local network
- Make sure both devices are on the same WiFi/LAN network
- Check that the server is running: `curl http://localhost:7003/manifest.json`
- Verify firewall allows connections on port 7003
- Try accessing from the same device first to verify the server works

### Torrent downloads taking too long or getting stuck
- The fetcher now uses a 1-minute timeout for new Real Debrid torrent downloads (reduced from 5 minutes)
- For existing torrents that are still downloading, the fetcher will:
  - Check the torrent status once (no waiting)
  - Show the current progress percentage (e.g., "still downloading (45.20%)")
  - Move on to the next post
  - Recheck on the next fetch cycle (every 15 minutes) to see if it's finished
- This prevents the script from getting stuck on slow downloads
- You'll see messages like "⏳ Torrent still downloading (X.XX%) - will check again next fetch" in the logs
- Once a torrent finishes downloading, it will be automatically processed on the next fetch cycle

### Database errors
- Ensure the plugin directory is writable
- Check disk space on your Raspberry Pi
- Try deleting `stremula.db` to start fresh (you'll lose processed data)

### Server won't start
- Check that port 7003 (or your configured port) is not in use
- Verify Node.js version is 16 or higher: `node --version`
- Check that all dependencies are installed: `npm install`

### Service keeps restarting
- If you see "Maximum restart attempts exceeded", there's a persistent error
- Check the logs to identify the root cause
- Common issues: database corruption, network connectivity, API authentication failures
- The service will stop restarting after 5 attempts in 60 seconds to prevent infinite loops


## 📊 Monitoring

### Check Server Status

The server runs on port 7003 by default. You can check if it's running:

```bash
# For localhost
curl http://localhost:7003/manifest.json

# For local network IP
curl http://YOUR_IP:7003/manifest.json
```

### Check Database

The database file is at `stremula.db`. You can inspect it using:

```bash
sqlite3 stremula.db
```

Then run SQL queries:
```sql
SELECT COUNT(*) FROM f1_weekends;
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM streaming_links;
```

### View Logs

If running with systemd:
```bash
# If using separate services:
sudo journalctl -u stremula-server -f
sudo journalctl -u stremula-fetcher -f

# If using single service:
sudo journalctl -u stremula -f
```

## 🔄 Manual Updates

To manually update your installation when new code is pushed to GitHub:

```bash
# Navigate to your project directory
cd ~/stremula-1
# or if installed in /opt:
cd /opt/stremula-1

# Pull latest changes from GitHub
git pull

# Reinstall dependencies (only if package.json changed)
npm install

# Restart services to apply changes
# If using separate systemd services:
sudo systemctl restart stremula-server
sudo systemctl restart stremula-fetcher

# If using single systemd service:
sudo systemctl restart stremula

# If running manually (not as a service):
# Press Ctrl+C to stop, then run:
npm start
```

**Note:** You only need to run `npm install` if `package.json` or `package-lock.json` changed in the update. The `git pull` command will show you which files changed.

## 🔐 Security Notes

- **Never commit `config.json`** with real credentials to version control
- The database file contains processed post data but not sensitive credentials
- Real Debrid API keys should be kept secure
- Reddit passwords should be kept secure

## 📝 License

MIT

## 🙏 Credits

- Formula 1 content provided by u/egortech on Reddit
- Real Debrid for streaming link conversion
- Stremio for the addon platform

---

**Note**: This addon is for personal use only. Respect Reddit's Terms of Service and Real Debrid's usage policies.

