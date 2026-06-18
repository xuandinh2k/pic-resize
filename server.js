const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Endpoint: Search Images via DuckDuckGo
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query (q)' });
  }

  try {
    // Step 1: Fetch main page to get the vqd token
    const mainUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    const mainRes = await fetch(mainUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });

    if (!mainRes.ok) {
      throw new Error(`Failed to load DuckDuckGo main page: ${mainRes.statusText}`);
    }

    const html = await mainRes.text();

    // Extract the vqd token
    const vqdMatch = html.match(/vqd=["']([^"']+)["']/i) || 
                     html.match(/vqd=([^&"'\s)]+)/i) ||
                     html.match(/vqd\s*:\s*['"]([^'"]+)['"]/i);

    if (!vqdMatch) {
      throw new Error('Could not find vqd token in DuckDuckGo response');
    }

    const vqd = vqdMatch[1];

    // Step 2: Fetch images from the internal DuckDuckGo API
    const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`;
    const imgRes = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/'
      }
    });

    if (!imgRes.ok) {
      throw new Error(`Failed to fetch images from DuckDuckGo API: ${imgRes.statusText}`);
    }

    const data = await imgRes.json();
    
    // Return structured results to frontend
    // data.results contains [{ title, image, thumbnail, width, height, source }]
    res.json({
      query: query,
      results: data.results || []
    });

  } catch (err) {
    console.error('Error during search:', err);
    res.status(500).json({ error: err.message });
  }
});

// API Endpoint: CORS Proxy for Image Downloads
app.get('/api/proxy', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const urlObj = new URL(imageUrl);
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Referer': urlObj.origin
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err) {
    console.error('Error in image proxy:', err);
    res.status(500).send(`Error fetching image: ${err.message}`);
  }
});

// Fallback to serve index.html for any other requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
