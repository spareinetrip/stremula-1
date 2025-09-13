# Stremula 1 - Deployment Guide

## 🚀 Free Hosting Options

### Option 1: Vercel (Recommended)

**Pros**: Fast, reliable, automatic HTTPS, easy setup
**Cons**: None for this use case

#### Steps:
1. Create account at [vercel.com](https://vercel.com)
2. Connect your GitHub repository
3. Deploy automatically
4. Your addon will be available at: `https://your-project.vercel.app/manifest.json`

#### Setup:
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables (if needed)
vercel env add NODE_ENV production
```

### Option 2: Railway

**Pros**: Good free tier, easy deployment
**Cons**: Limited free hours per month

#### Steps:
1. Create account at [railway.app](https://railway.app)
2. Connect GitHub repository
3. Railway auto-detects Node.js and deploys
4. Your addon will be available at: `https://your-app.railway.app/manifest.json`

### Option 3: Render

**Pros**: Good free tier, reliable
**Cons**: Sleeps after 15 minutes of inactivity

#### Steps:
1. Create account at [render.com](https://render.com)
2. Create new Web Service
3. Connect GitHub repository
4. Set build command: `npm install`
5. Set start command: `npm start`

### Option 4: GitHub Actions + GitHub Pages

**Pros**: Completely free, version controlled
**Cons**: More complex setup

#### Steps:
1. Enable GitHub Pages in repository settings
2. The workflow is already configured in `.github/workflows/deploy.yml`
3. Set repository secrets:
   - `VERCEL_TOKEN`: Your Vercel token
   - `ORG_ID`: Your Vercel organization ID
   - `PROJECT_ID`: Your Vercel project ID

## 🔧 Environment Setup

### Required Environment Variables

```bash
NODE_ENV=production
PORT=3000  # Usually set automatically by hosting platform
```

### Optional Environment Variables

```bash
CACHE_DURATION=1800000  # 30 minutes in milliseconds
MAX_STREAMS_PER_SESSION=10
REDDIT_RATE_LIMIT=100  # Posts to fetch per request
```

## 📱 Installing in Stremio

Once deployed, install your addon:

1. Open Stremio
2. Go to Addons (puzzle piece icon)
3. Click "Install from URL"
4. Enter your addon URL: `https://your-domain.com/manifest.json`
5. Click "Install"

## 🔄 Auto-Deployment

### GitHub Actions (Already Configured)

The repository includes a GitHub Actions workflow that:
- Runs tests on every push
- Deploys to Vercel on main branch pushes
- Handles pull requests

### Manual Deployment

```bash
# Install dependencies
npm install

# Test locally
npm test

# Deploy to Vercel
vercel --prod

# Or deploy to Railway
railway up
```

## 📊 Monitoring

### Health Check

Your addon exposes a health endpoint:
- `GET /manifest.json` - Returns addon manifest
- `GET /catalog/series/skyf1-2025.json` - Returns catalog
- `GET /meta/series/skyf1:1:bahrain-grand-prix.json` - Returns meta for specific GP

### Logs

Most hosting platforms provide logs:
- **Vercel**: Dashboard → Functions → View Logs
- **Railway**: Dashboard → Deployments → View Logs
- **Render**: Dashboard → Service → Logs

## 🛠️ Troubleshooting

### Common Issues

1. **Addon not loading in Stremio**
   - Check if URL is accessible: `curl https://your-domain.com/manifest.json`
   - Ensure HTTPS is working
   - Check CORS headers

2. **No content showing**
   - Check Reddit API access
   - Verify post parsing logic
   - Check cache status

3. **Performance issues**
   - Reduce cache duration
   - Limit number of posts fetched
   - Optimize comment extraction

### Debug Mode

Add debug logging:
```javascript
// In addon.js
const DEBUG = process.env.NODE_ENV !== 'production';

if (DEBUG) {
    console.log('Debug info:', data);
}
```

## 🔒 Security Considerations

1. **Rate Limiting**: Reddit API has rate limits
2. **CORS**: Stremio requires CORS headers (handled by SDK)
3. **HTTPS**: Required for remote addons
4. **User Agent**: Always set proper User-Agent for Reddit API

## 📈 Scaling

### For High Traffic

1. **Caching**: Implement Redis or similar
2. **CDN**: Use CloudFlare or similar
3. **Load Balancing**: Multiple instances
4. **Database**: Store processed data in database

### Performance Optimization

1. **Lazy Loading**: Only fetch content when requested
2. **Pagination**: Limit catalog size
3. **Compression**: Enable gzip compression
4. **Image Optimization**: Optimize poster/background images

## 🎯 Production Checklist

- [ ] HTTPS enabled
- [ ] CORS headers working
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Performance monitoring
- [ ] Backup strategy
- [ ] Documentation updated
- [ ] Testing completed
