const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const SNAPSHOT = path.join(__dirname, 'data', 'pl5-history.json');
const RECOMMENDATION_HISTORY = path.join(__dirname, 'data', 'recommendation-history.json');
const DATA_URLS = {
  pl3: 'https://tb.tuganjue.com/api/pl3/getTbList?action=kjfb&page=1&limit=10000&orderby=asc&start_issue=0&end_issue=0&week=all',
  pl5: 'https://tb.tuganjue.com/api/pl5/getTbList?action=kjfb&page=1&limit=10000&orderby=asc&start_issue=0&end_issue=0&week=all',
  kl8: 'https://tb.tuganjue.com/api/kl8/getTbList?action=kjfb&page=1&limit=10000&orderby=asc&start_issue=0&end_issue=0&week=all'
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const caches = { pl3: null, pl5: null, kl8: null };
const cacheTimes = { pl3: 0, pl5: 0, kl8: 0 };

function normalizeDraw(draw, lottery) {
  if (lottery === 'kl8') {
    const numbers = String(draw.winnum || '').replace(/<[^>]*>/g, ' ').match(/\d{1,2}/g) || [];
    return { ...draw, winnum: numbers.slice(0, 20).map((number) => number.padStart(2, '0')).join(' ') };
  }
  const count = lottery === 'pl3' ? 3 : 5;
  const clean = String(draw.winnum || '').replace(/<[^>]*>/g, '').replace(/\D/g, '').slice(0, count).padStart(count, '0');
  return { ...draw, winnum: clean.split('').join(' ') };
}

function readSnapshot(lottery) {
  if (lottery === 'kl8') return [];
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

function readRecommendationHistory() {
  try {
    const value = JSON.parse(fs.readFileSync(RECOMMENDATION_HISTORY, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function writeRecommendationHistory(history) {
  fs.mkdirSync(path.dirname(RECOMMENDATION_HISTORY), { recursive: true });
  fs.writeFileSync(RECOMMENDATION_HISTORY, JSON.stringify(history, null, 2));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 200000) request.destroy(new Error('Request too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

function isValidSnapshot(snapshot) {
  return snapshot && ['pl3', 'pl5', 'kl8'].includes(snapshot.lottery) && /^\d+$/.test(String(snapshot.sourceIssue || ''))
    && /^\d{4}-\d{2}-\d{2}$/.test(String(snapshot.date || '')) && Array.isArray(snapshot.recommendations)
    && snapshot.recommendations.length > 0 && snapshot.recommendations.length <= 4;
}

function settleRecommendationHistory(history, drawsByLottery) {
  let changed = false;
  history.forEach((entry) => {
    const draws = drawsByLottery[entry.lottery] || [];
    const sourceIndex = draws.findIndex((draw) => String(draw.issue) === String(entry.sourceIssue));
    const target = sourceIndex >= 0 ? draws[sourceIndex + 1] : null;
    if (!target) return;
    const actual = normalizeDraw(target, entry.lottery).winnum.replace(/\s/g, '');
    const results = entry.recommendations.map((recommendation) => {
      if (recommendation.type === 'set') {
        const actualNumbers = actual.match(/\d{2}/g) || [];
        const hitNumbers = actualNumbers.filter((number) => recommendation.picks.includes(number));
        return { key: recommendation.key, fullHit: false, positionHits: [], positionHitCount: hitNumbers.length, hitNumbers };
      }
      if (recommendation.type === 'tickets') {
        const tickets = recommendation.tickets || [];
        const positionHitCount = tickets.reduce((best, ticket) => Math.max(best, [...ticket].filter((digit, index) => digit === actual[index]).length), 0);
        return { key: recommendation.key, fullHit: tickets.includes(actual), ticketHitCount: tickets.filter((ticket) => ticket === actual).length, positionHits: [], positionHitCount };
      }
      if (recommendation.type === 'group6') {
        const actualDigits = [...actual];
        const hitNumbers = actualDigits.filter((digit) => recommendation.picks.includes(digit));
        const fullHit = new Set(actualDigits).size === 3 && hitNumbers.length === 3;
        return { key: recommendation.key, fullHit, positionHits: [], positionHitCount: hitNumbers.length, hitNumbers };
      }
      const picks = recommendation.picks || [];
      const positionHits = picks.map((list, position) => String(list).includes(actual[position]));
      return {
        key: recommendation.key,
        fullHit: positionHits.every(Boolean),
        positionHits,
        positionHitCount: positionHits.filter(Boolean).length
      };
    });
    const nextOutcome = { targetIssue: target.issue, targetDate: target.kjdate, actual, results };
    if (JSON.stringify(entry.outcome) !== JSON.stringify(nextOutcome) || entry.status !== 'settled') {
      entry.outcome = nextOutcome;
      entry.status = 'settled';
      changed = true;
    }
  });
  return changed;
}

function reviewAdaptation(history, lottery) {
  const settled = history.filter((entry) => entry.lottery === lottery && entry.status === 'settled');
  const observations = settled.flatMap((entry) => entry.recommendations.map((recommendation) => {
    const result = entry.outcome?.results?.find((item) => item.key === recommendation.key);
    if (!result || ['tickets', 'group6'].includes(recommendation.type)) return null;
    const actual = result.positionHitCount / recommendation.positionCount;
    const expected = recommendation.type === 'set' ? recommendation.picks.length / 80
      : recommendation.picks.reduce((total, picks) => total + picks.length / 10, 0) / recommendation.positionCount;
    return { actual, expected };
  }).filter(Boolean));
  const base = [.45, .35, .2];
  if (observations.length < 5) return { weights: base, sampleSize: observations.length, direction: '样本不足5档，保持基础权重' };
  const recent = observations.slice(-Math.min(5, observations.length));
  const delta = recent.reduce((total, item) => total + item.actual - item.expected, 0) / recent.length;
  if (delta <= -.04) return { weights: [.3, .35, .35], sampleSize: observations.length, direction: '近期覆盖偏低，降低30期权重并提高100期权重' };
  if (delta >= .04) return { weights: [.55, .3, .15], sampleSize: observations.length, direction: '近期覆盖偏高，适度提高30期权重' };
  return { weights: base, sampleSize: observations.length, direction: '近期覆盖接近理论，保持基础权重' };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/api/draws') {
    const requestedLottery = url.searchParams.get('lottery');
    const lottery = ['pl3', 'pl5', 'kl8'].includes(requestedLottery) ? requestedLottery : 'pl5';
    const draws = await getDraws(lottery, url.searchParams.get('refresh') === '1');
    const limit = Math.min(10000, Math.max(20, Number(url.searchParams.get('limit') || 300)));
    sendJson(response, 200, { lottery, updatedAt: new Date().toISOString(), total: draws.length, data: draws.slice(-limit) });
    return;
  }

  if (url.pathname === '/api/recommendations') {
    if (request.method === 'POST') {
      try {
        const snapshot = await parseBody(request);
        if (!isValidSnapshot(snapshot)) {
          sendJson(response, 400, { error: 'Invalid recommendation snapshot' });
          return;
        }
        const history = readRecommendationHistory();
        const id = `${snapshot.lottery}-${snapshot.date}-${snapshot.sourceIssue}`;
        const normalized = { ...snapshot, id, createdAt: snapshot.createdAt || new Date().toISOString(), status: 'pending', outcome: null };
        const index = history.findIndex((entry) => entry.id === id);
        if (index >= 0) history[index] = { ...history[index], ...normalized, createdAt: history[index].createdAt };
        else history.push(normalized);
        writeRecommendationHistory(history.slice(-1000));
        sendJson(response, 201, { id });
      } catch (_) {
        sendJson(response, 400, { error: 'Unable to save recommendation snapshot' });
      }
      return;
    }

    if (request.method === 'GET') {
      const lottery = url.searchParams.get('lottery');
      const history = readRecommendationHistory();
      const drawsByLottery = {
        pl3: await getDraws('pl3'),
        pl5: await getDraws('pl5'),
        kl8: await getDraws('kl8')
      };
      if (settleRecommendationHistory(history, drawsByLottery)) writeRecommendationHistory(history);
      const entries = history.filter((entry) => !lottery || entry.lottery === lottery)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      sendJson(response, 200, { data: entries, adaptation: reviewAdaptation(history, lottery) });
      return;
    }

    response.writeHead(405).end('Method not allowed');
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
