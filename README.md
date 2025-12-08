# Stremula 1 - Formula 1 Addon for Stremio

High-quality Sky Sports F1 replays with Real Debrid integration, optimized for Raspberry Pi with persistent database storage and automatic Localtunnel integration.

## 🚀 Features

- **Real Debrid Integration**: Direct streaming links with instant playback
- **Reddit Integration**: Public JSON API access to Formula 1 posts from u/egortech (no authentication required)
- **Persistent Database**: SQLite database stores all weekends and streaming links
- **Smart Fetching**: Automatic background service checks for new content every 30 minutes
- **Race Weekend Optimization**: Only fetches on Friday, Saturday, and Sunday (F1 race weekends) to stay within Reddit API limits
- **Quality Selection**: 4K and 1080p options when available
- **Session Detection**: Automatically detects Practice, Qualifying, Sprint, and Race sessions
- **Auto-Restart**: Built-in crash recovery with automatic restart functionality
- **Automatic HTTPS**: Localtunnel integration provides HTTPS access with valid certificates - no warnings, works everywhere

## 📋 Requirements

### 1. Real Debrid Account (REQUIRED)
- Sign up at [real-debrid.com](https://real-debrid.com)
- Get your API token from [API Token page](https://real-debrid.com/apitoken)

### 2. Node.js (REQUIRED)
- Node.js version 16 or higher
- npm (comes with Node.js)

### 3. Raspberry Pi (Recommended)
- Optimized for Raspberry Pi with systemd service setup
- Can run on any Linux system with Node.js

## ⚙️ Installation & Setup

### Step 1: Install on Raspberry Pi

Follow the complete setup guide: **[RASPBERRY_PI_SETUP.md](./RASPBERRY_PI_SETUP.md)**

**Quick summary:**
1. Clone repository to `/opt/stremula-1`
2. Install dependencies: `npm install`
3. Install Localtunnel: `sudo npm install -g localtunnel`
4. Configure `config.json` with your credentials
5. Set up systemd services for automatic startup

### Step 2: Configure Credentials

Edit `/opt/stremula-1/config.json`:

```json
{
  "realdebrid": {
    "apiKey": "YOUR_REAL_DEBRID_API_KEY",
    "enabled": true
  },
  "reddit": {
    "userAgent": "Stremula1/3.0"
  },
  "server": {
    "port": 7003,
    "publicBaseUrl": ""
  },
  "fetcher": {
    "intervalMinutes": 30,
    "maxScrollMonths": 3
  }
}
```

**Note:** Leave `publicBaseUrl` empty - it will be automatically updated by the tunnel service.

### Step 3: Start Services

```bash
# Start main service
sudo systemctl start stremula

# Start tunnel service
sudo systemctl start stremula-tunnel

# Enable to start on boot
sudo systemctl enable stremula
sudo systemctl enable stremula-tunnel
```

### Step 4: Get Your Tunnel URL

The tunnel service automatically creates a unique URL for your installation:

```bash
# View tunnel URL from logs
sudo journalctl -u stremula-tunnel -n 50 | grep "https://"

# Or check config.json
cat /opt/stremula-1/config.json | grep publicBaseUrl
```

You'll get a URL like: `https://stremula-1-raspberrypi-abc123.loca.lt`

## 📡 Installing in Stremio

1. **Get your tunnel URL** (see Step 4 above)
2. **Open Stremio** (Desktop or Web)
3. **Go to Addons** → **Community Addons**
4. **Click the "+" button**
5. **Enter your tunnel URL:**
   ```
   https://stremula-1-raspberrypi-abc123.loca.lt/manifest.json
   ```
   (Replace with your actual tunnel URL)
6. **Click "Install"**

**That's it!** The addon is now accessible from anywhere with no certificate warnings.

## 📥 Backfilling Historical Data

To fill your database with historical F1 weekends:

```bash
cd /opt/stremula-1

# Fetch any number of weekends
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

## 🚦 Fetcher Service Modes

### Normal Mode (Default)
The fetcher service runs continuously but **only fetches on Friday, Saturday, and Sunday** (F1 race weekends). This helps stay within Reddit API rate limits.

```bash
# Start both server and fetcher (normal mode)
npm start

# Or start fetcher only
npm run fetcher
```

### Force Weekend Mode
Override the weekday check to fetch on any day. Useful for testing or if you need to fetch content outside of race weekends.

```bash
# Start both server and fetcher with --force-weekend flag
npm run start:force

# Or start fetcher only with --force-weekend flag
npm run fetcher:force

# Or use direct node command
node fetcher-service.js --force-weekend
```

**Note:** The `--force-weekend` flag only applies to the fetcher service, not manual fetch commands.

## 🔧 Configuration Options

### config.json

- **realdebrid.apiKey**: Your Real Debrid API key (required)
- **realdebrid.enabled**: Set to `true` to enable Real Debrid (required)
- **reddit.userAgent**: User agent string for Reddit API requests (optional, default: "Stremula1/3.0")
- **server.port**: Port for the Stremio server (default: 7003)
- **server.publicBaseUrl**: Automatically updated by tunnel service - leave empty
- **fetcher.intervalMinutes**: How often to check for new posts (default: 30, only on Fri/Sat/Sun)
- **fetcher.maxScrollMonths**: How far back to search for posts (default: 3)

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

1. **Fetcher Service** runs continuously, checking for new posts every 30 minutes
   - **Smart Scheduling**: Only fetches on Friday, Saturday, and Sunday (F1 race weekends)
   - This reduces Reddit API calls and helps stay within rate limits
   - Use `--force-weekend` flag to override and fetch on any day
2. Each fetch:
   - Fetches newest posts from u/egortech on Reddit
   - For each new F1 weekend post found:
     - Extracts year from post title (e.g., 2025, 2026)
     - Automatically overwrites old weekends from previous year with same Grand Prix name
     - Extracts magnet link and session information
     - Converts magnet links to Real Debrid streaming links
     - Saves everything to the database
3. **Server** serves content from the database in real-time
4. **Tunnel Service** provides HTTPS access via Localtunnel with a unique subdomain
5. Posts are only marked as "fully processed" when ALL required sessions are found and converted
6. **Command Logging**: All available CLI commands are displayed when starting services

## 🔄 Auto-Restart Functionality

Both the server and fetcher service include built-in auto-restart functionality:

- **Automatic Recovery**: Handles crashes and unexpected errors
- **Smart Limiting**: Maximum 5 restarts per 60-second window
- **Graceful Shutdown**: Cleanly closes connections before restarting

Systemd provides additional protection for system-level failures.

## 🐛 Troubleshooting

### "Real Debrid not configured"
- Check that `realdebrid.apiKey` is set in `config.json`
- Verify the API key is correct at [real-debrid.com/apitoken](https://real-debrid.com/apitoken)

### "No posts found"
- Verify u/egortech is still posting Formula 1 content
- Check server logs for API errors
- Verify network connectivity to Reddit

### Can't access from Stremio
- **Get your tunnel URL**: `sudo journalctl -u stremula-tunnel -n 50 | grep "https://"`
- **Check tunnel is running**: `sudo systemctl status stremula-tunnel`
- **Test tunnel URL**: `curl https://YOUR_TUNNEL_URL/manifest.json`
- **If tunnel won't connect**: Restart services in order - `stremula` first, then `stremula-tunnel`. The tunnel needs the server running on port 7003 before it can connect.

### Server won't start
- Check that port 7003 is not in use
- Verify Node.js version is 16 or higher: `node --version`
- Check that all dependencies are installed: `npm install`
- Check logs: `sudo journalctl -u stremula -n 50`

## 📊 Monitoring

### Check Server Status

```bash
# Health check
curl http://localhost:7003/health

# Server info
curl http://localhost:7003/
```

### View Logs

```bash
# Main service logs
sudo journalctl -u stremula -f

# Tunnel service logs
sudo journalctl -u stremula-tunnel -f

# Press Ctrl + C to exit log view
```

### Check Database

```bash
cd /opt/stremula-1
sqlite3 stremula.db
```

Then run SQL queries:
```sql
SELECT COUNT(*) FROM f1_weekends;
SELECT COUNT(*) FROM sessions;
```

## 🔄 Manual Updates

```bash
cd /opt/stremula-1

# Pull latest changes
git pull

# Reinstall dependencies (if package.json changed)
npm install

# Restart services
sudo systemctl restart stremula
sudo systemctl restart stremula-tunnel
```

## 🛠️ CLI Commands Reference

### Start Commands
```bash
npm start                    # Start server + fetcher (normal mode, Fri/Sat/Sun only)
npm run start:force          # Start server + fetcher (force weekend mode, any day)
npm run server               # Start only server
npm run fetcher              # Start only fetcher (normal mode)
npm run fetcher:force        # Start only fetcher (force weekend mode)
```

### Manual Fetch Commands
```bash
npm run fetch                # Manual fetch (until fully processed weekend found)
npm run fetch1p              # Fetch 1 weekend
npm run fetch2p              # Fetch 2 weekends
npm run fetch3p              # Fetch 3 weekends
npm run fetch5p              # Fetch 5 weekends
npm run fetch10p             # Fetch 10 weekends
npm run fetch20p             # Fetch 20 weekends
npm run fetch24p             # Fetch 24 weekends (full season)
```

### Reset Commands
```bash
npm run reset-cache          # Reset processed posts cache (allows re-processing)
npm run reset-all            # Reset all data (weekends, sessions, links, posts)
node cli.js --reset-gp="Qatar Grand Prix"        # Reset specific Grand Prix
node cli.js --reset-gp="Qatar Grand Prix R23"     # Reset specific Grand Prix round
```

**Note:** For `--reset-gp`, you must use `node cli.js` directly because npm scripts don't handle quoted arguments well.

## 🔐 Security Notes

- **Never commit `config.json`** with real credentials to version control
- Real Debrid API keys should be kept secure
- The database file contains processed post data but not sensitive credentials

## 📝 License

MIT

## 🙏 Credits

- Formula 1 content provided by u/egortech on Reddit
- Real Debrid for streaming link conversion
- Stremio for the addon platform

---

**Note**: This addon is for personal use only. Respect Reddit's Terms of Service and Real Debrid's usage policies.
