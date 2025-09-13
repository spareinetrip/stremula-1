# Stremula 1 - Formula 1 Addon for Stremio

High-quality Sky Sports F1 replays with Real Debrid integration, now using Reddit API for reliable post fetching.

## 🚀 Features

- **Real Debrid Integration**: Direct streaming links with instant playback
- **Reddit API Access**: Reliable, authenticated access to Formula 1 posts
- **Smart Caching**: Persistent cache system for faster loading
- **Session Detection**: Automatically detects Practice, Qualifying, Sprint, and Race sessions
- **Quality Selection**: 4K and 1080p options when available

## 📋 Requirements

### 1. Real Debrid Account (REQUIRED)
- Sign up at [real-debrid.com](https://real-debrid.com)
- Get your API token from [API Token page](https://real-debrid.com/apitoken)

### 2. Reddit API Credentials (REQUIRED)
The addon now uses Reddit's official API to avoid 403 blocking issues.

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

## ⚙️ Configuration

### Option 1: Web Configuration (Recommended)
1. Start the addon: `node addon.js`
2. Open [http://localhost:7003/config.html](http://localhost:7003/config.html)
3. Enter your Real Debrid API key
4. Enter your Reddit API credentials
5. Test both configurations
6. Save the settings

### Option 2: Environment Variables
Set these environment variables:

```bash
# Real Debrid (Required)
export REALDEBRID_API_KEY="your_real_debrid_api_key"

# Reddit API (Required)
export REDDIT_CLIENT_ID="your_reddit_client_id"
export REDDIT_CLIENT_SECRET="your_reddit_client_secret"
export REDDIT_USERNAME="your_reddit_username"
export REDDIT_PASSWORD="your_reddit_password"

# Optional
export REDDIT_USER_AGENT="Stremula1/2.0 (by u/yourusername)"
```

## 🏃‍♂️ Quick Start

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Credentials:**
   - Use the web interface at `/config.html` OR
   - Set environment variables

3. **Start the Addon:**
   ```bash
   node addon.js
   ```

4. **Install in Stremio:**
   - Open Stremio
   - Go to Addons → Community Addons
   - Click the "+" button
   - Enter: `http://localhost:7003/manifest.json`

## 🔧 Technical Details

### Reddit API Integration
- Uses OAuth2 authentication for reliable access
- Fetches posts from u/egortech (Formula 1 content provider)
- Scans back 5 months for comprehensive content coverage
- Rate-limited to respect Reddit's API limits

### Real Debrid Processing
- Converts magnet links to direct streaming URLs
- Supports multiple video qualities (4K, 1080p)
- Instant playback without download waiting

### Caching System
- **Posts Cache**: Stores Reddit posts for 24 hours
- **Addon Cache**: Stores processed Grand Prix data
- **Fully Processed Posts**: Tracks completed posts to avoid re-processing

## 📊 Addon Status

Check addon status at: `http://localhost:7003/api/addon-status`

Response includes:
- Cache status and Grand Prix count
- Real Debrid configuration status
- Reddit API configuration status
- Processing progress

## 🐛 Troubleshooting

### "Reddit API credentials NOT configured"
- Ensure you've created a Reddit app with "script" type
- Double-check all four credentials are correct
- Test credentials using the web interface

### "Real Debrid not configured"
- Get your API token from [real-debrid.com/apitoken](https://real-debrid.com/apitoken)
- Test the API key using the web interface

### "No posts found" or "Cache updated with 0 Grand Prix"
- Check Reddit API credentials are working
- Verify u/egortech is still posting Formula 1 content
- Check server logs for authentication errors

### 403 Errors (Should be fixed now!)
- The addon now uses Reddit API instead of web scraping
- Ensure Reddit API credentials are properly configured
- Check that your Reddit app is set to "script" type

## 🔄 Updates

The addon automatically:
- Updates every 30 minutes via cron job
- Processes new posts in the background
- Maintains persistent cache between restarts
- Handles Reddit API token refresh automatically

## 📝 Logs

Monitor addon logs for:
- Reddit API authentication status
- Real Debrid conversion progress
- Cache update activities
- Error messages and debugging info

## 🚨 Important Notes

1. **Reddit API is REQUIRED**: Without proper Reddit API credentials, the addon cannot fetch posts
2. **Real Debrid is REQUIRED**: Without Real Debrid, no streaming links will be available
3. **Rate Limiting**: The addon respects Reddit's API rate limits (60 requests/minute)
4. **Token Refresh**: OAuth tokens are automatically refreshed when needed

## 📞 Support

If you encounter issues:
1. Check the addon status endpoint
2. Review server logs for error messages
3. Verify all credentials are correct
4. Ensure Reddit app is configured as "script" type

---

**Note**: This addon is for personal use only. Respect Reddit's Terms of Service and Real Debrid's usage policies.