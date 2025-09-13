const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
// Deprecated: merged into addon.js single server for Render
const port = process.env.PORT || 7002;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Serve configuration page
app.get('/config.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'config.html'));
});

// API endpoint to save Real-Debrid configuration
app.post('/api/config', express.json(), (req, res) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey) {
            return res.status(400).json({ error: 'API key is required' });
        }
        
        // Validate API key format - Real-Debrid keys can vary in length
        if (!/^[a-zA-Z0-9]{20,}$/.test(apiKey)) {
            return res.status(400).json({ error: 'Invalid API key format' });
        }
        
        // Save configuration
        const config = {
            apiKey: apiKey,
            enabled: true,
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'realdebrid-config.json'),
            JSON.stringify(config, null, 2)
        );
        
        console.log('Real-Debrid configuration saved successfully');
        res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
        console.error('Error saving configuration:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

// API endpoint to get Real-Debrid configuration
app.get('/api/config', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'realdebrid-config.json');
        
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json(config);
        } else {
            res.json({ enabled: false });
        }
    } catch (error) {
        console.error('Error reading configuration:', error);
        res.status(500).json({ error: 'Failed to read configuration' });
    }
});

// API endpoint to test Real-Debrid API key
app.post('/api/test-key', express.json(), async (req, res) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey) {
            return res.status(400).json({ error: 'API key is required' });
        }
        
        // Test the API key
        const axios = require('axios');
        const response = await axios.get('https://api.real-debrid.com/rest/1.0/user', {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (response.status === 200) {
            res.json({ 
                success: true, 
                user: response.data,
                message: `Welcome ${response.data.username}!` 
            });
        } else {
            res.status(400).json({ error: 'Invalid API key' });
        }
    } catch (error) {
        console.error('Error testing API key:', error);
        res.status(500).json({ error: 'Failed to test API key' });
    }
});

// API endpoint to get addon processing status
app.get('/api/addon-status', async (req, res) => {
    try {
        // Check if addon server is running by testing the manifest
        const axios = require('axios');
        const host = req.headers.host;
        const proto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || 'http';
        const response = await axios.get(`${proto}://${host}/manifest.json`, { timeout: 2000 });
        
        // Since we can't get real status from the addon server, return a basic status
        res.json({
            status: 'online',
            cache: {
                grandPrixCount: 'Unknown - check addon logs',
                lastUpdate: 'Unknown - check addon logs',
                isProcessing: 'Unknown - check addon logs',
                processingProgress: { current: 'Unknown', total: 'Unknown', percentage: 'Unknown' }
            },
            realdebrid: {
                enabled: true,
                configured: true
            },
            message: 'Addon server is running. Check console logs for processing status.'
        });
    } catch (error) {
        res.json({
            status: 'offline',
            cache: {
                grandPrixCount: 0,
                lastUpdate: 0,
                isProcessing: false,
                processingProgress: { current: 0, total: 0, percentage: 0 }
            },
            realdebrid: {
                enabled: false,
                configured: false
            },
            error: 'Addon server not responding'
        });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Stremula 1 Configuration Server running on http://localhost:${port}`);
    console.log(`Real Debrid Configuration: http://localhost:${port}/config.html`);
    console.log('This server provides Real Debrid configuration for Stremula 1 addon');
});
