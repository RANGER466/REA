import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Simple in-memory cache for search & category queries
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Guaranteed high-quality fallback videos
const FALLBACK_VIDEOS = [
  {
    id: "jfKfPfyJRdk",
    title: "lofi hip hop radio - beats to relax/study to",
    channel: "Lofi Girl",
    views: "85M views",
    date: "Live",
    duration: "LIVE",
    thumbnail: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg"
  },
  {
    id: "PkZNo7MFNFg",
    title: "Learn JavaScript - Full Course for Beginners",
    channel: "freeCodeCamp.org",
    views: "18M views",
    date: "2 years ago",
    duration: "3:26:42",
    thumbnail: "https://i.ytimg.com/vi/PkZNo7MFNFg/hqdefault.jpg"
  },
  {
    id: "dGcsHMXbSOA",
    title: "Web Development in 2026 - A Complete Overview",
    channel: "Fireship",
    views: "1.2M views",
    date: "3 weeks ago",
    duration: "11:42",
    thumbnail: "https://i.ytimg.com/vi/dGcsHMXbSOA/hqdefault.jpg"
  },
  {
    id: "bMknfKXIFA8",
    title: "React Course - Beginner's Tutorial for React JavaScript",
    channel: "freeCodeCamp.org",
    views: "4.5M views",
    date: "1 year ago",
    duration: "11:55:28",
    thumbnail: "https://i.ytimg.com/vi/bMknfKXIFA8/hqdefault.jpg"
  },
  {
    id: "sBws8MSXN7A",
    title: "Elden Ring: The Ultimate Lore & World Exploration",
    channel: "VaatiVidya",
    views: "3.9M views",
    date: "1 year ago",
    duration: "48:15",
    thumbnail: "https://i.ytimg.com/vi/sBws8MSXN7A/hqdefault.jpg"
  },
  {
    id: "yPYZpwSpKmA",
    title: "The Joe Rogan Experience #2054 - Lex Fridman",
    channel: "PowerfulJRE",
    views: "2.8M views",
    date: "6 months ago",
    duration: "2:54:19",
    thumbnail: "https://i.ytimg.com/vi/yPYZpwSpKmA/hqdefault.jpg"
  },
  {
    id: "21X5lGlDOfg",
    title: "NASA Webb Space Telescope: Pillars of Creation in Depth",
    channel: "NASA",
    views: "5.1M views",
    date: "1 year ago",
    duration: "14:02",
    thumbnail: "https://i.ytimg.com/vi/21X5lGlDOfg/hqdefault.jpg"
  },
  {
    id: "dQw4w9WgXcQ",
    title: "Rick Astley - Never Gonna Give You Up (Official Music Video)",
    channel: "Rick Astley",
    views: "1.5B views",
    date: "14 years ago",
    duration: "3:32",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
  }
];

async function fetchYouTubeVideos(query) {
  const cached = cache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const html = await response.text();

    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData = ({.*?});<\/script>/s);
    if (!match) throw new Error("Could not find ytInitialData in response");

    const data = JSON.parse(match[1]);
    const videos = [];
    const seenIds = new Set();

    function walk(obj) {
      if (!obj || typeof obj !== "object") return;
      if (obj.videoRenderer && obj.videoRenderer.videoId) {
        const v = obj.videoRenderer;
        if (!seenIds.has(v.videoId)) {
          seenIds.add(v.videoId);
          videos.push({
            id: v.videoId,
            title: v.title?.runs?.[0]?.text || v.title?.simpleText || "Untitled Video",
            channel: v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || "YouTube Channel",
            views: v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || "Popular",
            date: v.publishedTimeText?.simpleText || "",
            duration: v.lengthText?.simpleText || "Video",
            thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            category: query
          });
        }
      }
      for (const k of Object.keys(obj)) {
        walk(obj[k]);
      }
    }

    walk(data);

    if (videos.length === 0) {
      return FALLBACK_VIDEOS;
    }

    cache.set(query, { data: videos, timestamp: Date.now() });
    return videos;
  } catch (err) {
    console.error(`Error querying YouTube for "${query}":`, err.message);
    return FALLBACK_VIDEOS;
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  // API: Live Search
  if (parsedUrl.pathname === "/api/search") {
    const q = parsedUrl.searchParams.get("q") || "trending";
    const videos = await fetchYouTubeVideos(q);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({ query: q, count: videos.length, videos }));
    return;
  }

  // API: Categories / Trending
  if (parsedUrl.pathname === "/api/category") {
    const cat = parsedUrl.searchParams.get("c") || "trending";
    const queryMap = {
      "All": "trending",
      "Music": "top trending music official video",
      "Tech": "computer programming technology web dev",
      "Gaming": "trending gameplay walkthrough",
      "Podcasts": "full video podcast episode",
      "Lo-Fi": "lofi hip hop radio beats to relax study",
      "Science": "science space cosmos exploration documentaries",
      "Shorts": "trending shorts viral"
    };
    const searchQuery = queryMap[cat] || cat;
    const videos = await fetchYouTubeVideos(searchQuery);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({ category: cat, count: videos.length, videos }));
    return;
  }

  // Static files
  let filePath = path.join(__dirname, parsedUrl.pathname === "/" ? "index.html" : parsedUrl.pathname);

  // Directory traversal defense
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(__dirname, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(content);
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`YouTube Desktop Clone live server running at: http://localhost:${PORT}`);
});
