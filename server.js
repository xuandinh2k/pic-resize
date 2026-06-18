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
  const source = req.query.source || 'ddg';
  if (!query) {
    return res.status(400).json({ error: 'Missing search query (q)' });
  }

  try {
    if (source === 'wiki') {
      // Fetch from Wikimedia Commons API (Highly stable and does not block Vercel)
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|thumburl&iiurlwidth=330&format=json&gsrlimit=100`;
      
      const wikiRes = await fetch(wikiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      });

      if (!wikiRes.ok) {
        throw new Error(`Failed to fetch from Wikimedia Commons: ${wikiRes.statusText}`);
      }

      const data = await wikiRes.json();
      const pages = data.query ? data.query.pages : {};
      const results = [];

      for (const [id, page] of Object.entries(pages)) {
        if (page.imageinfo && page.imageinfo.length > 0) {
          const info = page.imageinfo[0];
          results.push({
            title: page.title.replace('File:', ''),
            image: info.url,
            thumbnail: info.thumburl || info.url,
            width: info.width,
            height: info.height
          });
        }
      }

      return res.json({
        query: query,
        results: results
      });
    }

    if (source === 'baidu') {
      // Fetch from Baidu Images API (Does not block Vercel)
      const baiduUrl = `https://image.baidu.com/search/acjson?tn=resultjson_com&ipn=rj&fp=result&queryWord=${encodeURIComponent(query)}&cl=2&lm=-1&ie=utf-8&oe=utf-8&word=${encodeURIComponent(query)}&rn=80`;
      
      const baiduRes = await fetch(baiduUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Accept': 'text/plain, */*; q=0.01',
          'Referer': 'https://image.baidu.com/'
        }
      });

      if (!baiduRes.ok) {
        throw new Error(`Failed to fetch from Baidu: ${baiduRes.statusText}`);
      }

      const rawText = await baiduRes.text();
      // Clean invalid control characters and backslashes in JSON
      const cleanText = rawText
        .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
        .replace(/\\(?!["\\\/bfnrtu])/g, "\\\\");

      const data = JSON.parse(cleanText);
      const items = data.data || [];
      const results = [];

      items.forEach(item => {
        if (item.hoverURL || item.middleURL || item.thumbURL) {
          results.push({
            title: item.fromPageTitleEnc || item.fromPageTitle || 'Baidu Image',
            image: item.hoverURL || item.middleURL || item.thumbURL,
            thumbnail: item.thumbURL || item.middleURL,
            width: item.width || 1024,
            height: item.height || 768
          });
        }
      });

      return res.json({
        query: query,
        results: results
      });
    }

    if (source === 'flickr') {
      // Fetch from Flickr public feed API (Does not block Vercel)
      const flickrUrl = `https://www.flickr.com/services/feeds/photos_public.gne?tags=${encodeURIComponent(query)}&format=json&nojsoncallback=1`;
      
      const flickrRes = await fetch(flickrUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      });

      if (!flickrRes.ok) {
        throw new Error(`Failed to fetch from Flickr: ${flickrRes.statusText}`);
      }

      const data = await flickrRes.json();
      const items = data.items || [];
      const results = [];

      items.forEach(item => {
        if (item.media && item.media.m) {
          const thumbnail = item.media.m;
          // _m.jpg is medium, replace with _b.jpg for large 1024px
          const image = item.media.m.replace('_m.', '_b.');
          results.push({
            title: item.title || 'Flickr Photo',
            image: image,
            thumbnail: thumbnail,
            width: 1024,
            height: 768
          });
        }
      });

      return res.json({
        query: query,
        results: results
      });
    }

    // Default: DuckDuckGo Image Search
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

    let results = [];
    let nextPath = `/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`;

    // Fetch 4 pages to get ~300 images
    for (let page = 1; page <= 4; page++) {
      let urlPath = nextPath;
      if (!urlPath.startsWith('/')) {
        urlPath = '/' + urlPath;
      }
      
      const imgUrl = `https://duckduckgo.com${urlPath}`;
      const imgRes = await fetch(imgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Referer': 'https://duckduckgo.com/'
        }
      });

      if (!imgRes.ok) {
        console.warn(`Failed to fetch DuckDuckGo page ${page}: ${imgRes.statusText}`);
        break;
      }

      const data = await imgRes.json();
      const pageResults = data.results || [];
      results = results.concat(pageResults);

      if (data.next) {
        nextPath = data.next;
        if (!nextPath.includes('vqd=')) {
          nextPath += `&vqd=${vqd}`;
        }
      } else {
        break;
      }

      // Small delay between requests to be polite to DuckDuckGo
      if (page < 4) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    
    // Return structured results to frontend
    res.json({
      query: query,
      results: results
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

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

module.exports = app;
