# Stremula 1 - Real Debrid Only

A Stremio addon for Formula 1 race replays that works exclusively with Real Debrid for high-quality streaming.

## Features

- **Real Debrid Integration**: All streams are converted to Real Debrid direct links for fast, reliable playback
- **Formula 1 Content**: Complete race weekends with all sessions (Practice, Qualifying, Race, etc.)
- **Session-Specific File Selection**: Intelligent matching of session files to ensure correct content playback
- **Direct Integration**: No external dependencies - direct Real Debrid API integration

## Requirements

- **Real Debrid Account**: You need an active Real Debrid subscription
- **Real Debrid API Key**: Get your API key from [Real Debrid API Token page](https://real-debrid.com/apitoken)

## Installation

### Installation Steps

1. Start the addon servers:
   ```bash
   cd stremula-1
   npm install
   npm start
   ```

2. Open your browser and go to: `http://localhost:7002/config.html`

3. Enter your Real Debrid API key and click "Test API Key" to verify it works

4. Click "Save Configuration" to store your API key

5. Click the "Install Stremula 1 Addon" button to install directly in Stremio

### Manual Installation

If the direct install doesn't work:

1. Follow steps 1-4 above to configure Real Debrid

2. Copy the manual installation link from the configuration page

3. In Stremio, go to Addons → Community Addons → Add from URL

4. Paste the manifest URL and click "Install"

## How It Works

### Real Debrid Integration

The addon uses a two-step process:

1. **Magnet Link Processing**: The addon fetches Formula 1 content magnet links from egortech's Reddit posts
2. **Real Debrid Conversion**: Each magnet link is automatically converted to Real Debrid direct download links
3. **Session Matching**: Intelligent file selection ensures the correct session file is played

### Session-Specific File Selection

The addon includes advanced logic to match the correct file for each session:

- **Practice Sessions**: Matches FP1, FP2, FP3 files
- **Qualifying**: Matches qualifying-specific files
- **Race**: Matches race files (excluding sprint races)
- **Sprint**: Matches sprint race files
- **Supporting Content**: Matches Ted's Notebook, Press Conferences, F1 Show, etc.

### Direct Real Debrid Integration

The addon directly integrates with Real Debrid API:

- Converts magnet links to Real Debrid direct download URLs
- Handles Real Debrid authentication using your API key
- Provides direct streaming links that work with Stremio
- No external dependencies or third-party services

## Configuration

### Real Debrid Setup

1. **Get API Key**: Visit [Real Debrid API Token page](https://real-debrid.com/apitoken)
2. **Copy API Key**: Copy your API token
3. **Configure Addon**: Use the configuration page to enter your API key

### Server Configuration

The addon runs on two ports:

- **Port 7002**: Configuration server (config.html)
- **Port 7003**: Main addon server (manifest.json)

## Troubleshooting

### No Streams Available

- **Check Real Debrid Configuration**: Ensure your API key is valid and entered correctly
- **Verify Real Debrid Account**: Make sure your Real Debrid subscription is active
- **Test API Key**: Use the "Test API Key" button in the configuration page

### Wrong Session Playing

- **Session Matching**: The addon uses intelligent file matching, but may occasionally select the wrong file
- **File Selection**: Check the console logs for file selection details
- **Manual Selection**: You may need to manually select the correct file in some cases

### Real Debrid Cache Status

- **⚡ Icon**: Content is cached on Real Debrid servers - instant playback
- **No ⚡ Icon**: Content will be downloaded to Real Debrid when playback starts (may take a few minutes)

## Technical Details

### Architecture

```
Stremio Client
    ↓
Stremula 1 Addon (Port 7003)
    ↓
Real Debrid API (Link Conversion)
    ↓
Direct Download Links
```

### File Structure

```
stremula-1/
├── addon.js              # Main addon logic
├── server.js             # Configuration server
├── config.html           # Real Debrid configuration page
├── realdebrid-config.json # Real Debrid API key storage
├── package.json          # Dependencies
└── README.md             # This file
```

### Dependencies

- `stremio-addon-sdk`: Stremio addon framework
- `axios`: HTTP client for API requests
- `cheerio`: HTML parsing for Reddit content
- `node-cron`: Scheduled cache updates
- `express`: Configuration server

## Changelog

### Version 2.0.0 (Real Debrid Only)

- **BREAKING**: Removed all P2P streaming support
- **NEW**: Real Debrid-only streaming with direct API integration
- **IMPROVED**: Enhanced session-specific file selection logic
- **NEW**: Configuration page with Real Debrid setup
- **IMPROVED**: Better error handling and user feedback
- **REMOVED**: No external dependencies or third-party services

### Version 1.0.4 (Legacy)

- Initial release with P2P and Real Debrid support
- Basic session matching

## Support

For issues and support:

1. Check the console logs for error messages
2. Verify your Real Debrid configuration
3. Test your API key using the configuration page
4. Ensure your Real Debrid subscription is active

## License

This project is for educational purposes. Please respect content creators and streaming services' terms of service.