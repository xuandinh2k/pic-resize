const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Endpoint: Search Images from all sources (aggregated)
const isVercel = !!process.env.VERCEL;

async function fetchWithTimeout(url, options = {}, timeout = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function fetchWiki(query) {
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|thumburl&iiurlwidth=330&format=json&gsrlimit=80`;
    
    const res = await fetchWithTimeout(wikiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    }, 4000);

    if (!res.ok) throw new Error(`Wikimedia returned status ${res.status}`);
    
    const data = await res.json();
    const pages = data.query ? data.query.pages : {};
    const results = [];

    for (const [id, page] of Object.entries(pages)) {
      if (page.imageinfo && page.imageinfo.length > 0) {
        const info = page.imageinfo[0];
        results.push({
          title: page.title.replace('File:', ''),
          image: info.url,
          thumbnail: info.thumburl || info.url,
          width: info.width || 1024,
          height: info.height || 768,
          source: 'Wikimedia'
        });
      }
    }
    return results;
  } catch (err) {
    console.error('fetchWiki error:', err.message);
    return [];
  }
}

async function fetchBaidu(query) {
  try {
    const baiduUrl = `https://image.baidu.com/search/acjson?tn=resultjson_com&ipn=rj&fp=result&queryWord=${encodeURIComponent(query)}&cl=2&lm=-1&ie=utf-8&oe=utf-8&word=${encodeURIComponent(query)}&rn=80`;
    
    const res = await fetchWithTimeout(baiduUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/plain, */*; q=0.01',
        'Referer': 'https://image.baidu.com/'
      }
    }, 4000);

    if (!res.ok) throw new Error(`Baidu returned status ${res.status}`);
    
    const rawText = await res.text();
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
          height: item.height || 768,
          source: 'Baidu'
        });
      }
    });
    return results;
  } catch (err) {
    console.error('fetchBaidu error:', err.message);
    return [];
  }
}

async function fetchFlickr(query) {
  try {
    const flickrUrl = `https://www.flickr.com/services/feeds/photos_public.gne?tags=${encodeURIComponent(query)}&format=json&nojsoncallback=1`;
    
    const res = await fetchWithTimeout(flickrUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    }, 4000);

    if (!res.ok) throw new Error(`Flickr returned status ${res.status}`);
    
    const data = await res.json();
    const items = data.items || [];
    const results = [];

    items.forEach(item => {
      if (item.media && item.media.m) {
        const thumbnail = item.media.m;
        const image = item.media.m.replace('_m.', '_b.');
        results.push({
          title: item.title || 'Flickr Photo',
          image: image,
          thumbnail: thumbnail,
          width: 1024,
          height: 768,
          source: 'Flickr'
        });
      }
    });
    return results;
  } catch (err) {
    console.error('fetchFlickr error:', err.message);
    return [];
  }
}

async function fetchDDG(query) {
  const ddgTimeout = isVercel ? 1200 : 4000;
  
  try {
    const mainUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    
    const mainRes = await fetchWithTimeout(mainUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    }, ddgTimeout);

    if (!mainRes.ok) throw new Error(`DDG main returned status ${mainRes.status}`);

    const html = await mainRes.text();
    const vqdMatch = html.match(/vqd=["']([^"']+)["']/i) || 
                     html.match(/vqd=([^&"'\s)]+)/i) ||
                     html.match(/vqd\s*:\s*['"]([^'"]+)['"]/i);

    if (!vqdMatch) throw new Error('Could not find vqd token');

    const vqd = vqdMatch[1];
    let results = [];
    let nextPath = `/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`;

    const pagesToFetch = isVercel ? 1 : 2;

    for (let page = 1; page <= pagesToFetch; page++) {
      let urlPath = nextPath;
      if (!urlPath.startsWith('/')) {
        urlPath = '/' + urlPath;
      }
      
      const imgUrl = `https://duckduckgo.com${urlPath}`;
      const imgRes = await fetchWithTimeout(imgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Referer': 'https://duckduckgo.com/'
        }
      }, ddgTimeout);

      if (!imgRes.ok) break;

      const data = await imgRes.json();
      const pageResults = data.results || [];
      
      pageResults.forEach(item => {
        results.push({
          title: item.title || 'DuckDuckGo Image',
          image: item.image,
          thumbnail: item.thumbnail,
          width: item.width || 1024,
          height: item.height || 768,
          source: 'DuckDuckGo'
        });
      });

      if (data.next) {
        nextPath = data.next;
        if (!nextPath.includes('vqd=')) {
          nextPath += `&vqd=${vqd}`;
        }
      } else {
        break;
      }

      if (page < pagesToFetch) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    return results;
  } catch (err) {
    console.error('fetchDDG error:', err.message);
    return [];
  }
}

async function fetchBing(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 4000);

    if (!res.ok) throw new Error(`Bing returned status ${res.status}`);
    
    const html = await res.text();
    const iuscMatches = html.match(/class="iusc"[^>]*?m="([^"]+?)"/g) || [];
    const results = [];

    iuscMatches.forEach(match => {
      try {
        const mJsonText = match.match(/m="([^"]+?)"/)[1].replace(/&quot;/g, '"');
        const mJson = JSON.parse(mJsonText);
        if (mJson.murl && mJson.turl) {
          results.push({
            title: mJson.t || mJson.desc || 'Bing Image',
            image: mJson.murl,
            thumbnail: mJson.turl.replace(/&amp;/g, '&'),
            width: 1024,
            height: 768,
            source: 'Bing'
          });
        }
      } catch (e) {
        // Ignore single parse errors
      }
    });
    return results;
  } catch (err) {
    console.error('fetchBing error:', err.message);
    return [];
  }
}

async function fetchGoogle(query) {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=en&gl=us`;
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': desktopUA,
        'Cookie': 'CONSENT=YES+cb.20210831-07-p0.en+FX+999;'
      }
    }, 4000);

    if (!res.ok) throw new Error(`Google returned status ${res.status}`);
    
    const html = await res.text();
    const imgRegex = /\["https?:\/\/[^"]+?",\d+,\d+\]/g;
    const matches = html.match(imgRegex) || [];
    
    const results = [];
    const originalUrls = [];
    const thumbnailUrls = [];

    matches.forEach(match => {
      try {
        const parsed = JSON.parse(match);
        const urlStr = parsed[0];
        const height = parsed[1];
        const width = parsed[2];

        if (urlStr.includes('gstatic.com')) {
          thumbnailUrls.push({ url: urlStr, width, height });
        } else if (urlStr.startsWith('http')) {
          originalUrls.push({ url: urlStr, width, height });
        }
      } catch (e) {
        // Ignore single parse errors
      }
    });

    const count = Math.min(originalUrls.length, thumbnailUrls.length);
    for (let i = 0; i < count; i++) {
      results.push({
        title: 'Google Image',
        image: originalUrls[i].url,
        thumbnail: thumbnailUrls[i].url,
        width: originalUrls[i].width,
        height: originalUrls[i].height,
        source: 'Google'
      });
    }
    
    return results;
  } catch (err) {
    console.error('fetchGoogle error:', err.message);
    return [];
  }
}

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query (q)' });
  }

  try {
    // Run searches in parallel
    const [wikiResults, baiduResults, flickrResults, ddgResults, bingResults, googleResults] = await Promise.all([
      fetchWiki(query),
      fetchBaidu(query),
      fetchFlickr(query),
      fetchDDG(query),
      fetchBing(query),
      fetchGoogle(query)
    ]);

    // Interleave results to mix sources nicely
    let allResults = [];
    const maxLength = Math.max(
      wikiResults.length, 
      baiduResults.length, 
      flickrResults.length, 
      ddgResults.length,
      bingResults.length,
      googleResults.length
    );
    
    for (let i = 0; i < maxLength; i++) {
      if (i < ddgResults.length) allResults.push(ddgResults[i]);
      if (i < bingResults.length) allResults.push(bingResults[i]);
      if (i < googleResults.length) allResults.push(googleResults[i]);
      if (i < baiduResults.length) allResults.push(baiduResults[i]);
      if (i < wikiResults.length) allResults.push(wikiResults[i]);
      if (i < flickrResults.length) allResults.push(flickrResults[i]);
    }
    
    // Deduplicate by original image URL
    const seenUrls = new Set();
    const uniqueResults = [];
    for (const item of allResults) {
      if (!seenUrls.has(item.image)) {
        seenUrls.add(item.image);
        uniqueResults.push(item);
      }
    }

    res.json({
      query: query,
      results: uniqueResults
    });

  } catch (err) {
    console.error('Error during aggregated search:', err);
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
