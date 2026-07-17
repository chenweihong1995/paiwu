const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const SNAPSHOT = path.join(__dirname, 'data', 'pl5-history.json');
const DATA_URLS = {
  pl3: 'https://tb.tuganjue.com/api/pl3/getTbList?action=kjfb&page=1&limit=10000&orderby=asc&start_issue=0&end_issue=0&week=all',
  pl5: 'https://tb.tuganjue.com/api/pl5/getTbList?action=kjfb&page=1&limit=10000&orderby=asc&start_issue=0&end_issue=0&week=all'
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const caches = { pl3: null, pl5: null };
const cacheTimes = { pl3: 0, pl5: 0 };

function normalizeDraw(draw, lottery) {
  const count = lottery === 'pl3' ? 3 : 5;
  const clean = String(draw.winnum || '').replace(/<[^>]*>/g, '').replace(/\D/g, '').slice(0, count).padStart(count, '0');
  return { ...draw, winnum: clean.split('').join(' ') };
}

function readSnapshot(lottery) {
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  return (raw.data?.data || raw.data || []).map((draw) => normalizeDraw(draw, lottery));
}

function fetchRemote(lottery) {
  return new Promise((resolve, reject) => {
    const request = https.get(DATA_URLS[lottery], { timeout: 12000 }, (response) => {
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
          resolve((parsed.data?.data || []).map((draw) => normalizeDraw(draw, lottery)));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

async function getDraws(lottery, force = false) {
  if (!force && caches[lottery] && Date.now() - cacheTimes[lottery] < 10 * 60 * 1000) return caches[lottery];
  try {
    const remote = await fetchRemote(lottery);
    if (remote.length) {
      caches[lottery] = remote;
      cacheTimes[lottery] = Date.now();
      return remote;
    }
  } catch (_) {
    // The bundled snapshot keeps the tool usable during upstream downtime.
  }
  caches[lottery] = readSnapshot(lottery);
  cacheTimes[lottery] = Date.now();
  return caches[lottery];
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/api/draws') {
    const lottery = url.searchParams.get('lottery') === 'pl3' ? 'pl3' : 'pl5';
    const draws = await getDraws(lottery, url.searchParams.get('refresh') === '1');
    const limit = Math.min(10000, Math.max(20, Number(url.searchParams.get('limit') || 300)));
    sendJson(response, 200, { lottery, updatedAt: new Date().toISOString(), total: draws.length, data: draws.slice(-limit) });
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
  console.log(`Lottery Trend Lab running on ${HOST}:${PORT}`);
});
