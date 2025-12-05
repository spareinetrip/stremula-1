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

### Step 1: Install Dependencies

```bash
cd stremula-1
npm install
```

### Step 2: Configure the Plugin

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
    "port": 7003,
    "publicBaseUrl": ""
  },
  "fetcher": {
    "intervalMinutes": 15,
    "maxScrollMonths": 3
  }
}
```

**Important Notes:**
- Replace all `YOUR_*` placeholders with your actual credentials
- **`userAgent`**: Should match your Reddit username (e.g., if your username is `yourusername`, use `"Stremula1/3.0 (by u/yourusername)"`). This is required by Reddit's API.
- **`publicBaseUrl`**: 
  - Leave empty (`""`) if running locally (will auto-detect from requests)
  - Set to your public URL (e.g., `"https://YOUR_IP:7004"` for IP access or `"https://yourdomain.com"` for public server) if accessing from other devices on your network or the internet
  - This is used for serving media files (posters, thumbnails) to Stremio clients
- The `intervalMinutes` setting controls how often the fetcher checks for new posts (default: 15 minutes)

### Step 3: Initialize the Database

The database will be automatically created on first run. No manual setup needed!

## 🏃‍♂️ Running the Plugin

The plugin consists of two components that should run simultaneously:

### 1. Stremio Server (Always Running)

This is the main server that serves content to Stremio. It should run constantly:

```bash
npm start
```

Or:

```bash
node server.js
```

The server will:
- Start HTTP server on port 7003 (or configured port) for localhost access (127.0.0.1)
- Start HTTPS server on port 7004 (or configured port + 1) for IP address access (with self-signed certificate)
- Serve content from the database
- Be ready immediately (no startup delay)
- **Auto-restart on crashes**: Automatically restarts if it crashes (up to 5 restarts per minute)

### 2. Fetcher Service (Background Process)

This service fetches new posts from Reddit and processes them:

```bash
npm run fetcher
```

Or:

```bash
node fetcher-service.js
```

The fetcher service will:
- Run an initial fetch immediately
- Then fetch every 15 minutes (or your configured interval) continuously
- Each fetch round stops when it finds a fully processed weekend (both 1080p and 2160p posts fully processed)
- The service continues running and automatically schedules the next fetch
- Process new posts and add them to the database
- Handle errors gracefully without crashing the service
- **Auto-restart on crashes**: Automatically restarts if it crashes (up to 5 restarts per minute)

### Running Both Services

On a Raspberry Pi, you'll want to run both services. Here are some options:

#### Option 1: Using screen (Recommended for Raspberry Pi)

```bash
# Install screen if not already installed
sudo apt-get install screen

# Start server in a screen session
screen -S stremula-server
npm start
# Press Ctrl+A then D to detach

# Start fetcher in another screen session
screen -S stremula-fetcher
npm run fetcher
# Press Ctrl+A then D to detach

# To reattach later:
screen -r stremula-server
screen -r stremula-fetcher
```

#### Option 2: Using systemd (Best for production - provides additional restart protection)

**Note**: Both the server and fetcher now have built-in auto-restart functionality. Using systemd adds an extra layer of protection by restarting the processes even if the built-in restart mechanism fails.

Create two systemd service files:

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

## 📥 Backfilling Historical Data

To fill your database with historical F1 weekends, use the CLI tool:

```bash
# Fetch 1 weekend
npm run fetch1p

# Fetch 2 weekends
npm run fetch2p

# Fetch 3 weekends
npm run fetch3p

# Fetch 5 weekends
npm run fetch5p

# Fetch 10 weekends
npm run fetch10p

# Fetch 20 weekends
npm run fetch20p

# Fetch all 24 weekends (full 2025 season)
npm run fetch24p

# Or use the CLI directly:
node cli.js --fetch1p
node cli.js --fetch2p
# etc.
```

**Note:** The normal fetcher service will stop each fetch round when it finds a fully processed weekend, but the service itself continues running and will automatically start the next fetch round after the configured interval. The CLI tool with `--fetchXp` will fetch a specific number of weekends regardless of processing status.

## 📡 Installing in Stremio

1. Open Stremio
2. Go to Addons → Community Addons
3. Click the "+" button
4. Enter your addon URL:
   - **Localhost**: `http://localhost:7003/manifest.json` or `http://127.0.0.1:7003/manifest.json`
   - **Network IP**: `https://YOUR_IP:7004/manifest.json` (note: port 7004 for HTTPS)
   - **Public server**: `https://YOUR_DOMAIN:7003/manifest.json`

**Note:** 
- **Localhost** uses HTTP on port 7003 (Stremio allows HTTP for 127.0.0.1)
- **IP addresses** require HTTPS on port 7004 with a self-signed certificate. When accessing via IP, your browser may show a "Website is not secure" warning. This is normal and safe for local use. To proceed:
  1. Open the addon URL directly in your browser (e.g., `https://YOUR_IP:7004/manifest.json`)
  2. Click "Advanced" or "Show Details" on the security warning
  3. Click "Proceed" or "Accept the Risk and Continue"
  4. Then add the addon in Stremio
  
  This only needs to be done once per browser session.

## 🔧 Configuration Options

### config.json

- **realdebrid.apiKey**: Your Real Debrid API key (required)
- **realdebrid.enabled**: Set to `true` to enable Real Debrid (required)
- **reddit.clientId**: Reddit app client ID (required)
- **reddit.clientSecret**: Reddit app client secret (required)
- **reddit.username**: Your Reddit username (required)
- **reddit.password**: Your Reddit password (required)
- **server.port**: Port for the Stremio server (default: 7003)
- **server.publicBaseUrl**: 
  - Leave empty (`""`) for local use (will auto-detect from requests)
  - Set to your IP address with HTTPS (e.g., `"https://YOUR_IP:7004/manifest.json"`) if accessing from other devices on your network
  - Set to your domain (e.g., `"https://yourdomain.com"`) if running on a public server
  - This URL is used to serve media files (posters, thumbnails) to Stremio clients
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
- **processed_posts**: Tracks which Reddit posts have been processed
- **f1_weekends**: Stores F1 weekend information
- **sessions**: Stores individual session data (Practice, Qualifying, Race, etc.)
- **streaming_links**: Stores Real Debrid streaming links for each session

**Important:** The database is persistent, so processed posts won't be reprocessed. This means:
- Faster subsequent fetches
- No duplicate Real Debrid conversions
- Historical data is preserved

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
     - Converts magnet link to Real Debrid streaming links
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
# For localhost (HTTP on port 7003)
curl http://localhost:7003/manifest.json

# For IP address (HTTPS on port 7004 with self-signed cert)
curl https://YOUR_IP:7004/manifest.json -k
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
sudo journalctl -u stremula-server -f
sudo journalctl -u stremula-fetcher -f
```

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

