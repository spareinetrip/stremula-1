# External Cache Setup Guide

## Problem Solved
Your Stremula addon was losing all cache data every time Render restarts it (after 15 minutes of inactivity) because Render's free tier uses ephemeral storage. This caused:
- Full reprocessing of all posts on every restart
- Slow startup times (several minutes)
- Risk of hitting API rate limits

## Solution: External Cache with JSONBin.io

I've implemented an external cache system using JSONBin.io that persists your cache data even when Render restarts your service.

### How It Works
1. **Dual Storage**: Cache is saved both locally (for speed) and externally (for persistence)
2. **Smart Fallback**: If local cache is missing, it automatically loads from external cache
3. **Seamless Integration**: Works with your existing cache system without breaking changes

### Setup Instructions

#### Step 1: Create JSONBin.io Account
1. Go to [https://jsonbin.io/](https://jsonbin.io/)
2. Sign up for a free account
3. Verify your email

#### Step 2: Create Access Key
1. Log into your JSONBin.io dashboard
2. Go to "API Keys" section
3. Create a new access key with permissions: Bins, Create, Read, Update
4. Copy the **Access Key ID** (looks like `68c60125d0ea881f407d128e`)

#### Step 3: Create Bins
You need to create 3 separate bins for different cache types:

1. **Main Cache Bin** (for Grand Prix data):
   - Go to "My Bins" → "Create Bin"
   - Name: `stremula-cache`
   - Copy the Bin ID (looks like `507f1f77bcf86cd799439011`)

2. **Posts Cache Bin** (for Reddit posts):
   - Create another bin
   - Name: `stremula-posts`
   - Copy the Bin ID

3. **Processed Posts Bin** (for fully processed posts):
   - Create another bin
   - Name: `stremula-processed`
   - Copy the Bin ID

#### Step 4: Configure Environment Variables in Render
Add these environment variables to your Render service:

```
EXTERNAL_CACHE_ENABLED=true
JSONBIN_ACCESS_KEY_ID=your_access_key_id_here
JSONBIN_CACHE_BIN_ID=your_cache_bin_id_here
JSONBIN_POSTS_BIN_ID=your_posts_bin_id_here
JSONBIN_PROCESSED_BIN_ID=your_processed_bin_id_here
```

Replace the placeholder values with your actual Access Key ID and bin IDs.

#### Step 5: Deploy and Test
1. Deploy your updated addon to Render
2. Check the logs - you should see:
   ```
   🌐 External Cache Configuration Check:
   ✅ External cache enabled
      Access Key ID: 68c60125...
      Cache Bin ID: 507f1f77bcf86cd799439011
      Posts Bin ID: 507f1f77bcf86cd799439012
      Processed Bin ID: 507f1f77bcf86cd799439013
   ```

### Benefits After Setup

✅ **Persistent Cache**: Your cache survives Render restarts
✅ **Fast Startup**: No more full reprocessing on every restart
✅ **API Rate Limit Protection**: Fewer API calls to Reddit/Real-Debrid
✅ **Reliable Service**: Consistent performance regardless of Render's restart cycle

### Monitoring

The addon will log cache operations:
- `🌐 External cache saved successfully` - When saving to JSONBin
- `🌐 External cache loaded successfully` - When loading from JSONBin
- `📁 Local cache loaded` - When using local cache (faster)
- `💾 External cache data saved locally` - When restoring from external to local

### Troubleshooting

**Cache not loading?**
- Check your Access Key ID is correct
- Verify bin IDs are correct
- Check JSONBin.io service status

**Still processing everything?**
- Check logs for external cache configuration
- Verify environment variables are set correctly
- Wait for first successful cache save

**API limits?**
- JSONBin.io free tier: 10,000 requests/month
- Your addon uses ~10-20 requests per restart
- Should be well within limits

### Cost
- **JSONBin.io Free Tier**: 10,000 requests/month (more than enough)
- **Render**: No additional cost (still using free tier)

### Fallback Behavior
If external cache fails for any reason:
- Addon continues working with local cache only
- No service interruption
- Cache will be rebuilt on next successful external save

---

## Quick Setup Checklist

- [ ] Create JSONBin.io account
- [ ] Generate Access Key ID
- [ ] Create 3 bins (cache, posts, processed)
- [ ] Add 5 environment variables to Render
- [ ] Deploy and verify logs show external cache enabled
- [ ] Test by restarting service and checking cache loads

Your addon will now maintain its cache across Render restarts! 🎉
