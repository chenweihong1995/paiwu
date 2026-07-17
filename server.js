const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const SNAPSHOT = path.join(__dirname, 'data', 'pl5-history.json');
const DATA_URL = 'https://tb.tuganjue.com/api/pl5/getTbList?action=kjfb&page=1&limit=10000&orderby=asc&start_issue=0&end_issue=0&week=all';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

let cache = null;
let cacheTime = 0;

function readSnapshot() {
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  return raw.data?.data || raw.data || [];
}

function fetchRemote() {
  return new Promise((resolve, reject) => {
    const request = https.get(DATA_URL, { timeout: 12000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.data?.data || []);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

async function getDraws(force = false) {
  if (!force && cache && Date.now() - cacheTime < 10 * 60 * 1000) return cache;
  try {
    const remote = await fetchRemote();
    if (remote.length) {
      cache = remote;
      cacheTime = Date.now();
      return remote;
    }
  } catch (_) {
    // The bundled snapshot keeps the tool usable during upstream downtime.
  }
  cache = readSnapshot();
  cacheTime = Date.now();
  return cache;
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/api/draws') {
    const draws = await getDraws(url.searchParams.get('refresh') === '1');
    const limit = Math.min(10000, Math.max(20, Number(url.searchParams.get('limit') || 300)));
    sendJson(response, 200, { updatedAt: new Date().toISOString(), total: draws.length, data: draws.slice(-limit) });
    return;
  }

  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    response.end(contents);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`PL5 Trend Lab running on ${HOST}:${PORT}`);
});
