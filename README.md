# Stremula 1 - Formula 1 Addon for Stremio

High-quality Sky Sports F1 replays with Real Debrid integration, optimized for Raspberry Pi with persistent database storage.

## 🚀 Features

- **Real Debrid Integration**: Direct streaming links with instant playback
- **Reddit API Access**: Reliable, authenticated access to Formula 1 posts from u/egortech
- **Persistent Database**: SQLite database stores all weekends and streaming links
- **Smart Fetching**: Automatic background service checks for new content every 15 minutes
- **Quality Selection**: 4K and 1080p options when available
- **Session Detection**: Automatically detects Practice, Qualifying, Sprint, and Race sessions
- **Auto-Restart**: Built-in crash recovery with automatic restart functionality
- **Easy Access**: Works with Stremio desktop app (HTTP) or web (via Localtunnel)

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

### Step 1: Get the Project

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/stremula-1.git
cd stremula-1
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Generate Configuration File

The `config.json` file is automatically created on first run:

```bash
# Run the server briefly to generate config.json
# Press Ctrl+C after a few seconds to stop it
npm start
```

Wait a few seconds, then press `Ctrl + C` to stop the services.

### Step 4: Configure the Plugin

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
- Replace all placeholder values with your actual credentials
- `publicBaseUrl`: Leave empty for local use, or set to your Localtunnel URL (see below)
- `userAgent`: Should match your Reddit username format

### Step 5: Test the Installation

```bash
npm start
```

You should see output from both services:
- **SERVER** - Database initialization and server startup
- **FETCHER** - Initial fetch and background service

Press `Ctrl + C` to stop both services.

## 🏃‍♂️ Running the Plugin

### Quick Start

```bash
npm start
```

This starts both services:
- **SERVER** - The Stremio server that serves content
- **FETCHER** - The background service that fetches new posts

### Running Services Individually

**Server only:**
```bash
npm run server
```

**Fetcher only:**
```bash
npm run fetcher
```

### Running in Production

For production deployments, use systemd. See [RASPBERRY_PI_SETUP.md](./RASPBERRY_PI_SETUP.md) for complete setup instructions.

## 📡 Installing in Stremio

### Option 1: Stremio Desktop App (Recommended - Easiest)

**For localhost access:**
```
http://localhost:7003/manifest.json
```

**For network access (same WiFi):**
1. Find your server's IP address:
   ```bash
   hostname -I  # On Linux/Raspberry Pi
   ifconfig     # On macOS
   ipconfig     # On Windows
   ```

2. Use the HTTP URL:
   ```
   http://YOUR_IP:7003/manifest.json
   ```

3. Add in Stremio:
   - Open Stremio Desktop
   - Go to **Addons** → **Community Addons**
   - Click the **"+"** button
   - Paste the URL and click **"Install"**

### Option 2: Stremio Web (via Localtunnel)

Stremio web requires HTTPS. Use Localtunnel for easy, free HTTPS access:

1. **Install Localtunnel:**
   ```bash
   npm install -g localtunnel
   ```

2. **Start your server:**
   ```bash
   npm start
   ```

3. **In a separate terminal, start the tunnel:**
   ```bash
   lt --port 7003
   ```

4. **You'll get a URL like:**
   ```
   https://random-name.loca.lt
   ```

5. **Update config.json** (optional but recommended):
   ```json
   "server": {
     "port": 7003,
     "publicBaseUrl": "https://random-name.loca.lt"
   }
   ```
   Restart the server after updating.

6. **Add to Stremio Web:**
   - Go to [web.stremio.com](https://web.stremio.com)
   - Go to **Addons** → **Community Addons**
   - Click the **"+"** button
   - Enter: `https://random-name.loca.lt/manifest.json`
   - Click **"Install"**

**Benefits of Localtunnel:**
- ✅ No certificate warnings (valid SSL certificate)
- ✅ Works with Stremio web
- ✅ Works on all devices (iOS, Android, web browsers)
- ✅ No port forwarding needed
- ✅ Free and easy to use

**Note:** The tunnel URL changes each time you restart it. For permanent access, consider running the tunnel as a systemd service or using a paid tunneling service with static URLs.

## 📥 Backfilling Historical Data

To fill your database with historical F1 weekends:

```bash
# Fetch any number of weekends (X can be any number)
node cli.js --fetchXp

# Examples:
node cli.js --fetch1p    # Fetch 1 weekend
node cli.js --fetch5p    # Fetch 5 weekends
node cli.js --fetch24p   # Fetch 24 weekends (full season)

# Convenience npm scripts:
npm run fetch1p
npm run fetch5p
npm run fetch24p
```

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
  - Set to your Localtunnel URL (e.g., `"https://random-name.loca.lt"`) for web access
  - Used to serve media files (posters, thumbnails) to Stremio clients
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

1. **Fetcher Service** runs continuously, checking for new posts every 15 minutes
2. Each fetch:
   - Fetches newest posts from u/egortech on Reddit
   - For each new F1 weekend post found:
     - Extracts year from post title (e.g., 2025, 2026)
     - Automatically overwrites old weekends from previous year with same Grand Prix name
     - Extracts magnet link and session information
     - Converts magnet links to Real Debrid streaming links
     - Saves everything to the database
3. **Server** serves content from the database in real-time
4. Posts are only marked as "fully processed" when ALL required sessions are found and converted

## 🔄 Auto-Restart Functionality

Both the server and fetcher service include built-in auto-restart functionality:

- **Automatic Recovery**: Handles crashes and unexpected errors
- **Smart Limiting**: Maximum 5 restarts per 60-second window
- **Graceful Shutdown**: Cleanly closes connections before restarting

For production deployments, also use systemd for additional protection (see [RASPBERRY_PI_SETUP.md](./RASPBERRY_PI_SETUP.md)).

## 🐛 Troubleshooting

### "Real Debrid not configured"
- Check that `realdebrid.apiKey` is set in `config.json`
- Verify the API key is correct at [real-debrid.com/apitoken](https://real-debrid.com/apitoken)

### "Reddit API not configured"
- Check that all Reddit credentials are set in `config.json`
- Verify your Reddit app is set to "script" type

### "No posts found"
- Check Reddit API credentials are working
- Verify u/egortech is still posting Formula 1 content
- Check server logs for authentication errors

### Can't access from Stremio
- **Desktop app**: Make sure you're using `http://` (not `https://`)
- **Web app**: Use Localtunnel for HTTPS access
- Check firewall: `sudo ufw allow 7003/tcp`
- Verify server is running: `curl http://localhost:7003/health`

### Server won't start
- Check that port 7003 is not in use
- Verify Node.js version is 16 or higher: `node --version`
- Check that all dependencies are installed: `npm install`

## 📊 Monitoring

### Check Server Status

```bash
# Health check
curl http://localhost:7003/health

# Server info
curl http://localhost:7003/
```

### View Logs

If running with systemd:
```bash
sudo journalctl -u stremula-server -f
sudo journalctl -u stremula-fetcher -f
```

### Check Database

```bash
sqlite3 stremula.db
```

Then run SQL queries:
```sql
SELECT COUNT(*) FROM f1_weekends;
SELECT COUNT(*) FROM sessions;
```

## 🔄 Manual Updates

```bash
# Navigate to project directory
cd ~/stremula-1
# or
cd /opt/stremula-1

# Pull latest changes
git pull

# Reinstall dependencies (if package.json changed)
npm install

# Restart services
sudo systemctl restart stremula-server
sudo systemctl restart stremula-fetcher
```

## 🔐 Security Notes

- **Never commit `config.json`** with real credentials to version control
- Real Debrid API keys should be kept secure
- Reddit passwords should be kept secure
- The database file contains processed post data but not sensitive credentials

## 📝 License

MIT

## 🙏 Credits

- Formula 1 content provided by u/egortech on Reddit
- Real Debrid for streaming link conversion
- Stremio for the addon platform

---

**Note**: This addon is for personal use only. Respect Reddit's Terms of Service and Real Debrid's usage policies.
