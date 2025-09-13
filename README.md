# Stremula 1 (Real-Debrid)

High-quality Formula 1 replays for Stremio, powered by Real-Debrid. Single-server Express app: serves the addon and the configuration UI on one port, ready for local use or Render deployment.

## Features

- **Real-Debrid only**: Converts magnets to direct streaming links via Real-Debrid API
- **Complete weekends**: Practice, Qualifying, Sprint, Race (smart session matching)
- **Persistent caching**: Saves processed results to speed up subsequent runs
- **Single server**: One process serves `/manifest.json` and `/config.html`

## Requirements

- Real-Debrid subscription
- Real-Debrid API key: get from `https://real-debrid.com/apitoken`

## Quick start (local)

```bash
cd stremula-1
npm install
# Recommended: set API key via env var
REALDEBRID_API_KEY=your_token_here npm start
```

- Config page: `http://localhost:7003/config.html`
- Manifest: `http://localhost:7003/manifest.json`

If you didn’t set `REALDEBRID_API_KEY`, you can enter and save it on the config page.

## Deploy to Render (free tier)

1) Push this folder to a GitHub repo

2) Create a Render Web Service
- Root Directory: `stremula-1`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment variables:
  - `NODE_ENV=production`
  - `REALDEBRID_API_KEY=<your-token>` (recommended)

3) Use the provided URL
- Manifest: `https://<your-service>.onrender.com/manifest.json`
- Config: `https://<your-service>.onrender.com/config.html`

## Configuration options

- `REALDEBRID_API_KEY` (env): preferred for cloud deploys; avoids relying on disk writes
- Config file (local): saved as `realdebrid-config.json` when using the config page

## Endpoints

- `GET /manifest.json` — Stremio addon manifest
- `GET /api/config` — Read config (masks env-provided token)
- `POST /api/config` — Save config to file (local/dev)
- `POST /api/test-key` — Validate a Real-Debrid token
- `GET /api/addon-status` — Basic addon status
- Static assets: `/config.html`, `/media/*`, `/images/*`

## File structure

```
stremula-1/
├── addon.js                # Single Express server + Stremio addon router
├── config.html             # Real-Debrid configuration UI
├── realdebrid-config.json  # Saved config (local/dev)
├── media/                  # Posters & thumbnails
├── images/                 # Backgrounds
├── cache/                  # Addon caches
├── package.json
└── README.md
```

## Notes

- Initial processing runs in the background to avoid cold-start timeouts on Render.
- CLI utilities are disabled in cloud by default; set `ENABLE_CLI=1` to enable locally.

## License

This project is for educational purposes. Respect content creators and service terms.