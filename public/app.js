const state = { lottery: 'pl5', draws: [], periods: 50, mode: 'position', lines: true, view: 'overview' };
const overviewData = { pl3: [], pl5: [] };
const overviewRecommendations = { pl3: { wide: [], narrow: [] }, pl5: { wide: [], narrow: [] } };
const algorithmCaches = { pl3: null, pl5: null };
let positionNames = ['万位', '千位', '百位', '十位', '个位'];
let trendModes = [];
const baseTrendModes = [
  ['position', '定位走势', '位'], ['draw', '开奖走势', '开'],
  ['odd', '奇偶走势', '奇'], ['size', '大小走势', '大'], ['zone', '大中小走势', '区'],
  ['sum', '和值走势', '和'], ['tail', '和尾走势', '尾'], ['span', '跨度走势', '跨'],
  ['prime', '质合走势', '质'], ['updown', '升平降走势', '升'], ['max', '最大号走势', '高'],
  ['min', '最小号走势', '低'], ['sequence', '连号走势', '连'], ['amplitude', '振幅走势', '振']
];
const routeModes = {
  pl3: [['route-main', '012路走势图', '路'], ['route-digits', '012走势图2', '数'], ['route-direct', '012路直选图', '直']],
  pl5: [['route-main', '012路走势图', '路'], ['route-digits', '012走势图2', '数'], ['route-front4', '前四012', '前'], ['route-back4', '后四012', '后']]
};
const selectorState = {
  mode: 'compound',
  picks: Array.from({ length: 5 }, () => new Set()),
  locked: Array(5).fill(false),
  generatedTickets: [],
  filterInitialized: false,
  filters: {
    oddCounts: new Set(), bigCounts: new Set(), primeCounts: new Set(), distinctCounts: new Set(),
    route0Counts: new Set(), route1Counts: new Set(), route2Counts: new Set(), consecutive: 'any'
  }
};

const $ = (selector) => document.querySelector(selector);
const digitCount = () => state.lottery === 'pl3' ? 3 : 5;
const lotteryName = () => state.lottery === 'pl3' ? '排列三' : '排列五';
const drawDigits = (draw, count) => String(draw?.winnum || '').replace(/<[^>]*>/g, '').replace(/\D/g, '').slice(0, count).padStart(count, '0').split('').map(Number);
const digits = (draw) => drawDigits(draw, digitCount());
const sum = (values) => values.reduce((a, b) => a + b, 0);
const isPrime = (n) => [1, 2, 3, 5, 7].includes(n);

function refreshLotteryConfig() {
  positionNames = state.lottery === 'pl3' ? ['百位', '十位', '个位'] : ['万位', '千位', '百位', '十位', '个位'];
  trendModes = [...baseTrendModes.slice(0, 2), ...routeModes[state.lottery], ...baseTrendModes.slice(2)];
}

function metrics(draw, previous) {
  const ds = digits(draw);
  const total = sum(ds);
  const odd = ds.filter((n) => n % 2).length;
  const big = ds.filter((n) => n >= 5).length;
  const routes = [0, 1, 2].map((r) => ds.filter((n) => n % 3 === r).length);
  const prev = previous ? digits(previous) : ds;
  return {
    ds, total, tail: total % 10, span: Math.max(...ds) - Math.min(...ds),
    odd: `${odd}:${ds.length - odd}`, big: `${big}:${ds.length - big}`, route: ds.map((n) => n % 3).join(''),
    routeCount: routes.join(':'), zone: ds.map((n) => n <= 2 ? '小' : n <= 6 ? '中' : '大').join(''),
    prime: `${ds.filter(isPrime).length}:${ds.filter((n) => !isPrime(n)).length}`,
    updown: ds.map((n, i) => n > prev[i] ? '升' : n < prev[i] ? '降' : '平').join(''),
    max: Math.max(...ds), min: Math.min(...ds),
    sequence: [...new Set(ds)].sort((a, b) => a - b).some((n, i, arr) => i && n - arr[i - 1] === 1) ? '有' : '无',
    amplitude: ds.map((n, i) => Math.abs(n - prev[i])).join('')
  };
}

function buildMenu() {
  $('#trend-menu').innerHTML = trendModes.map(([id, label, icon]) =>
    `<button class="trend-button ${id === state.mode ? 'active' : ''}" data-mode="${id}"><span class="trend-icon">${icon}</span>${label}</button>`
  ).join('');
  document.querySelectorAll('.trend-button').forEach((button) => button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll('.trend-button').forEach((item) => item.classList.toggle('active', item === button));
    renderTrend();
  }));
}

function calculateOmits(draws) {
  const omit = Array.from({ length: digitCount() }, () => Array(10).fill(0));
  return draws.map((draw) => {
    const ds = digits(draw);
    const row = omit.map((position, p) => position.map((value, n) => n === ds[p] ? 0 : value + 1));
    for (let p = 0; p < digitCount(); p++) omit[p] = row[p].slice();
    return row;
  });
}

function renderSummary(selected) {
  const latest = selected[selected.length - 1];
  const prev = selected[selected.length - 2];
  if (!latest) return;
  const m = metrics(latest, prev);
  const values = [['期号', latest.issue, latest.kjdate], ['开奖号码', m.ds.join(' '), '直选'], ['和值 / 和尾', `${m.total} / ${m.tail}`, m.total >= digitCount() * 4.5 ? '大' : '小'], ['跨度', m.span, m.span >= 5 ? '大' : '小'], ['012路', m.route, m.routeCount], ['奇偶 / 大小', m.odd, m.big]];
  $('#summary-strip').innerHTML = values.map(([label, value, sub]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong><em>${sub}</em></div>`).join('');
}

function extraMetrics(draw, previous) {
  const m = metrics(draw, previous);
  const map = {
    position: [m.total, m.span, m.route, m.odd, m.big, m.prime], draw: [m.total, m.tail, m.span, m.odd, m.big, m.routeCount],
    odd: [m.odd, m.ds.map(n => n % 2 ? '奇' : '偶').join(''), m.total % 2 ? '奇' : '偶', m.tail % 2 ? '奇' : '偶', '', ''],
    size: [m.big, m.ds.map(n => n >= 5 ? '大' : '小').join(''), m.total >= digitCount() * 4.5 ? '大' : '小', m.span >= 5 ? '大' : '小', '', ''],
    zone: [m.zone, m.ds.filter(n => n <= 2).length, m.ds.filter(n => n >= 3 && n <= 6).length, m.ds.filter(n => n >= 7).length, '', ''],
    sum: [m.total, m.total >= digitCount() * 4.5 ? '大' : '小', m.total % 2 ? '奇' : '偶', m.total % 3, m.tail, ''], tail: [m.tail, m.tail >= 5 ? '大' : '小', m.tail % 2 ? '奇' : '偶', m.tail % 3, '', ''],
    span: [m.span, m.span >= 5 ? '大' : '小', m.span % 2 ? '奇' : '偶', m.span % 3, '', ''], prime: [m.prime, m.ds.map(n => isPrime(n) ? '质' : '合').join(''), '', '', '', ''],
    updown: [m.updown, '', '', '', '', ''], max: [m.max, m.max % 3, m.max % 2 ? '奇' : '偶', '', '', ''], min: [m.min, m.min % 3, m.min % 2 ? '奇' : '偶', '', '', ''],
    sequence: [m.sequence, '', '', '', '', ''], amplitude: [m.amplitude, '', '', '', '', '']
  };
  return map[state.mode] || map.position;
}

function analysisDefinition(mode) {
  const positional = (categories, value) => ({
    groups: positionNames.map((name, index) => ({ name, categories, value: (draw, previous) => value(digits(draw)[index], digits(previous || draw)[index]) }))
  });
  const single = (name, categories, value) => ({ groups: [{ name, categories, value }] });
  const definitions = {
    odd: positional(['偶', '奇'], (n) => n % 2 ? '奇' : '偶'),
    size: positional(['小', '大'], (n) => n >= 5 ? '大' : '小'),
    zone: positional(['小', '中', '大'], (n) => n <= 2 ? '小' : n <= 6 ? '中' : '大'),
    prime: positional(['合', '质'], (n) => isPrime(n) ? '质' : '合'),
    updown: positional(['升', '平', '降'], (n, prev) => n > prev ? '升' : n < prev ? '降' : '平'),
    amplitude: positional(Array.from({ length: 10 }, (_, n) => String(n)), (n, prev) => String(Math.abs(n - prev))),
    sum: single('和值', Array.from({ length: digitCount() * 9 + 1 }, (_, n) => String(n)), (draw) => String(sum(digits(draw)))),
    tail: single('和尾', Array.from({ length: 10 }, (_, n) => String(n)), (draw) => String(sum(digits(draw)) % 10)),
    span: single('跨度', Array.from({ length: 10 }, (_, n) => String(n)), (draw) => {
      const ds = digits(draw); return String(Math.max(...ds) - Math.min(...ds));
    }),
    max: single('最大号', Array.from({ length: 10 }, (_, n) => String(n)), (draw) => String(Math.max(...digits(draw)))),
    min: single('最小号', Array.from({ length: 10 }, (_, n) => String(n)), (draw) => String(Math.min(...digits(draw)))),
    sequence: single('连号', ['无', '有'], (draw) => metrics(draw).sequence)
  };
  return definitions[mode];
}

const routeDigitOrder = ['0', '3', '6', '9', '1', '4', '7', '2', '5', '8'];
const pl3ShapeMap = { '003': 'A', '012': 'B', '021': 'C', '030': 'D', '102': 'E', '111': 'F', '120': 'G', '201': 'H', '210': 'I', '300': 'J' };
const pl5Distributions = ['500', '410', '401', '320', '311', '302', '230', '221', '212', '203', '140', '131', '122', '113', '104', '050', '041', '032', '023', '014', '005'];
const directRoutes = Array.from({ length: 27 }, (_, index) => index.toString(3).padStart(3, '0'));
const pl5DirectRoutes = Array.from({ length: 243 }, (_, index) => index.toString(3).padStart(5, '0'));
const isRouteMode = (mode) => mode.startsWith('route-');

function routeCounts(draw, positions) {
  const ds = digits(draw);
  return [0, 1, 2].map((route) => positions.filter((position) => ds[position] % 3 === route).length);
}

function routeDefinition(mode) {
  const allPositions = positionNames.map((_, index) => index);
  const positions = mode === 'route-front4' ? allPositions.slice(0, 4) : mode === 'route-back4' ? allPositions.slice(-4) : allPositions;
  const positional = (categories, value) => positions.map((position) => ({
    name: positionNames[position], categories, value: (draw) => value(digits(draw)[position])
  }));
  const countGroups = [0, 1, 2].map((route) => ({
    name: `${route}码个数`, categories: Array.from({ length: positions.length + 1 }, (_, n) => String(n)),
    value: (draw) => String(routeCounts(draw, positions)[route])
  }));
  if (mode === 'route-digits') {
    return { groups: [
      ...positional(routeDigitOrder, (digit) => String(digit)), ...countGroups,
      { name: '组选012图', categories: routeDigitOrder, value: (draw) => [...new Set(digits(draw).map(String))] }
    ] };
  }
  const groups = [...positional(['0路', '1路', '2路'], (digit) => `${digit % 3}路`)];
  if (mode !== 'route-direct') groups.push(...countGroups);
  if (mode === 'route-front4' || mode === 'route-back4') return { groups };
  if (state.lottery === 'pl3') {
    groups.push({ name: '整体形态', categories: 'ABCDEFGHIJ'.split(''), value: (draw) => pl3ShapeMap[routeCounts(draw, positions).join('')] });
    if (mode === 'route-direct') groups.push({ name: '直选012分布', categories: directRoutes, value: (draw) => digits(draw).map((n) => n % 3).join('') });
  } else {
    groups.push({ name: '整体形态', categories: ['A', 'B', 'C'], value: (draw) => String(routeCounts(draw, positions).filter(Boolean).length).replace('1', 'A').replace('2', 'B').replace('3', 'C') });
    groups.push({ name: '路数分布', categories: pl5Distributions, value: (draw) => routeCounts(draw, positions).join('') });
  }
  return { groups };
}

function omissionStats(hits) {
  const indices = hits.map((hit, index) => hit ? index : -1).filter((index) => index >= 0);
  if (!indices.length) return { frequency: 0, current: hits.length, previous: hits.length, average: hits.length, maximum: hits.length };
  const gaps = [indices[0], ...indices.slice(1).map((index, i) => index - indices[i] - 1)];
  const current = hits.length - indices[indices.length - 1] - 1;
  return {
    frequency: indices.length,
    current,
    previous: gaps[gaps.length - 1],
    average: gaps.reduce((total, gap) => total + gap, 0) / gaps.length,
    maximum: Math.max(current, ...gaps)
  };
}

function renderRouteTrend(selected) {
  const definition = routeDefinition(state.mode);
  const columns = definition.groups.reduce((count, group) => count + group.categories.length, 0);
  const template = `82px 76px repeat(${columns}, 38px) 76px`;
  const omissions = definition.groups.map((group) => Object.fromEntries(group.categories.map((category) => [category, 0])));
  const hitHistory = definition.groups.map((group) => Object.fromEntries(group.categories.map((category) => [category, []])));
  const rows = state.draws.map((draw) => definition.groups.map((group, groupIndex) => {
    const raw = group.value(draw);
    const hits = new Set((Array.isArray(raw) ? raw : [raw]).map(String));
    const values = {};
    group.categories.forEach((category) => {
      const hit = hits.has(category);
      hitHistory[groupIndex][category].push(hit);
      omissions[groupIndex][category] = hit ? 0 : omissions[groupIndex][category] + 1;
      values[category] = omissions[groupIndex][category];
    });
    return { hits, values };
  }));
  const selectedRows = rows.slice(-selected.length);
  let html = `<div class="chart-row analysis-row header" style="grid-template-columns:${template}"><div class="chart-cell fixed">期号</div><div class="chart-cell fixed">日期</div>`;
  definition.groups.forEach((group) => group.categories.forEach((category, index) => {
    html += `<div class="chart-cell ${index === group.categories.length - 1 ? 'group-end' : ''}">${group.name}<br>${category}</div>`;
  }));
  html += '<div class="chart-cell metric-cell">开奖号</div></div>';
  selected.forEach((draw, rowIndex) => {
    html += `<div class="chart-row analysis-row" style="grid-template-columns:${template}"><div class="chart-cell fixed">${draw.issue}</div><div class="chart-cell fixed">${String(draw.kjdate).slice(5)}</div>`;
    definition.groups.forEach((group, groupIndex) => group.categories.forEach((category, categoryIndex) => {
      const row = selectedRows[rowIndex][groupIndex];
      const hit = row.hits.has(category);
      html += `<div class="chart-cell pos-${groupIndex % 5 + 1} ${hit ? 'hit' : ''} ${categoryIndex === group.categories.length - 1 ? 'group-end' : ''}">${hit ? category.replace('路', '') : row.values[category]}</div>`;
    }));
    html += `<div class="chart-cell metric-cell draw-number">${digits(draw).join('')}</div></div>`;
  });
  const summaries = [
    ['出现次数', 'frequency'], ['当前遗漏', 'current'], ['上期遗漏', 'previous'],
    ['平均遗漏', 'average'], ['最大遗漏', 'maximum'], ['欲出几率', 'desire']
  ];
  summaries.forEach(([label, key]) => {
    html += `<div class="chart-row analysis-row stats-row ${key === 'desire' ? 'desire-row' : ''}" style="grid-template-columns:${template}"><div class="chart-cell fixed">${label}</div><div class="chart-cell fixed">全历史</div>`;
    definition.groups.forEach((group, groupIndex) => group.categories.forEach((category, categoryIndex) => {
      const stats = omissionStats(hitHistory[groupIndex][category]);
      const value = key === 'average' ? stats.average.toFixed(1) : key === 'desire' ? `${Math.round(stats.current / Math.max(stats.average, 1) * 100)}%` : stats[key];
      html += `<div class="chart-cell ${categoryIndex === group.categories.length - 1 ? 'group-end' : ''}">${value}</div>`;
    }));
    html += '<div class="chart-cell metric-cell">-</div></div>';
  });
  $('#trend-table').innerHTML = html;
  requestAnimationFrame(drawLines);
}

function renderAnalysisTrend(selected) {
  const definition = analysisDefinition(state.mode);
  const columns = definition.groups.reduce((count, group) => count + group.categories.length, 0);
  const template = `82px 76px repeat(${columns}, 38px) 70px 70px 70px`;
  const allRows = [];
  const omissions = definition.groups.map((group) => Object.fromEntries(group.categories.map((category) => [category, 0])));
  state.draws.forEach((draw, index) => {
    const previous = state.draws[index - 1] || draw;
    const row = definition.groups.map((group, groupIndex) => {
      const hit = group.value(draw, previous);
      const values = {};
      group.categories.forEach((category) => {
        if (category === hit) omissions[groupIndex][category] = 0;
        else omissions[groupIndex][category] += 1;
        values[category] = omissions[groupIndex][category];
      });
      return { hit, values };
    });
    allRows.push(row);
  });
  const selectedRows = allRows.slice(-selected.length);
  let html = `<div class="chart-row analysis-row header" style="grid-template-columns:${template}"><div class="chart-cell fixed">期号</div><div class="chart-cell fixed">日期</div>`;
  definition.groups.forEach((group) => group.categories.forEach((category, index) => {
    html += `<div class="chart-cell ${index === group.categories.length - 1 ? 'group-end' : ''}">${group.name}<br>${category}</div>`;
  }));
  html += '<div class="chart-cell metric-cell">开奖号</div><div class="chart-cell metric-cell">和值</div><div class="chart-cell metric-cell">跨度</div></div>';
  selected.forEach((draw, index) => {
    const ds = digits(draw); const m = metrics(draw, selected[index - 1]);
    html += `<div class="chart-row analysis-row" style="grid-template-columns:${template}"><div class="chart-cell fixed">${draw.issue}</div><div class="chart-cell fixed">${String(draw.kjdate).slice(5)}</div>`;
    definition.groups.forEach((group, groupIndex) => group.categories.forEach((category, categoryIndex) => {
      const row = selectedRows[index][groupIndex]; const hit = row.hit === category;
      html += `<div class="chart-cell pos-${groupIndex % 5 + 1} ${hit ? 'hit' : ''} ${categoryIndex === group.categories.length - 1 ? 'group-end' : ''}">${hit ? category : row.values[category]}</div>`;
    }));
    html += `<div class="chart-cell metric-cell draw-number">${ds.join('')}</div><div class="chart-cell metric-cell">${m.total}</div><div class="chart-cell metric-cell">${m.span}</div></div>`;
  });
  $('#trend-table').innerHTML = html;
  requestAnimationFrame(drawLines);
}

function renderTrend() {
  const selected = state.draws.slice(-state.periods);
  const currentMode = trendModes.find(([id]) => id === state.mode);
  if (!currentMode) { state.mode = 'position'; return renderTrend(); }
  $('#view-title').textContent = currentMode[1];
  $('#view-subtitle').textContent = `${lotteryName()} · 近${selected.length}期 · ${isRouteMode(state.mode) ? '含全历史遗漏汇总' : `分位号码与${currentMode[1].replace('走势', '')}指标`}`;
  renderSummary(selected);
  if (isRouteMode(state.mode)) {
    renderRouteTrend(selected);
    return;
  }
  if (state.mode !== 'position' && state.mode !== 'draw') {
    renderAnalysisTrend(selected);
    return;
  }
  const omits = calculateOmits(state.draws).slice(-state.periods);
  const labels = { position: ['和值', '跨度', '012', '奇偶', '大小', '质合'], draw: ['和值', '和尾', '跨度', '奇偶', '大小', '路比'] };
  let html = '<div class="chart-row header"><div class="chart-cell fixed">期号</div><div class="chart-cell fixed">日期</div>';
  const template = `82px 76px repeat(${digitCount() * 10}, 30px) repeat(6, 60px)`;
  html = `<div class="chart-row header" style="grid-template-columns:${template}"><div class="chart-cell fixed">期号</div><div class="chart-cell fixed">日期</div>`;
  for (let p = 0; p < digitCount(); p++) for (let n = 0; n < 10; n++) html += `<div class="chart-cell ${n === 9 ? 'group-end' : ''}">${positionNames[p]}<br>${n}</div>`;
  html += (labels[state.mode] || labels.position).map((x) => `<div class="chart-cell metric-cell">${x}</div>`).join('') + '</div>';
  selected.forEach((draw, index) => {
    const ds = digits(draw);
    const rowOmits = omits[index];
    const previous = index ? selected[index - 1] : null;
    html += `<div class="chart-row" style="grid-template-columns:${template}"><div class="chart-cell fixed">${draw.issue}</div><div class="chart-cell fixed">${String(draw.kjdate).slice(5)}</div>`;
    for (let p = 0; p < digitCount(); p++) for (let n = 0; n < 10; n++) {
      const hit = ds[p] === n;
      html += `<div class="chart-cell pos-${p + 1} ${hit ? 'hit' : ''} ${n === 9 ? 'group-end' : ''}">${hit ? n : rowOmits[p][n]}</div>`;
    }
    html += extraMetrics(draw, previous).map((value) => `<div class="chart-cell metric-cell">${value}</div>`).join('') + '</div>';
  });
  $('#trend-table').innerHTML = html;
  requestAnimationFrame(drawLines);
}

function drawLines() {
  const canvas = $('#trend-lines');
  const table = $('#trend-table');
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = `${table.scrollWidth}px`; canvas.style.height = `${table.scrollHeight}px`;
  canvas.width = table.scrollWidth * ratio; canvas.height = table.scrollHeight * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, table.scrollWidth, table.scrollHeight);
  if (!state.lines || (state.mode !== 'position' && state.mode !== 'draw')) return;
  const left = 158, top = 52, rowH = 30, cellW = 30, colors = ['#d7473f', '#2f6ea4', '#167b78', '#b57718', '#7659a5'];
  const selected = state.draws.slice(-state.periods);
  for (let p = 0; p < digitCount(); p++) {
    ctx.beginPath(); ctx.strokeStyle = colors[p]; ctx.lineWidth = 1.5; ctx.globalAlpha = .5;
    selected.forEach((draw, i) => {
      const x = left + p * 300 + digits(draw)[p] * cellW + cellW / 2;
      const y = top + i * rowH + rowH / 2;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function seededNoise(seed) {
  let x = seed % 2147483647;
  return () => ((x = x * 16807 % 2147483647) - 1) / 2147483646;
}

function currentOmission(draws, value, target) {
  for (let index = draws.length - 1, omit = 0; index >= 0; index--, omit++) {
    const result = value(draws[index]);
    if ((Array.isArray(result) ? result : [result]).map(String).includes(String(target))) return omit;
  }
  return draws.length;
}

function rankedOmissions(draws, categories, value, limit) {
  return categories.map((category) => ({ label: String(category), omit: currentOmission(draws, value, category) }))
    .sort((a, b) => b.omit - a.omit || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function patternList(symbols, count) {
  let values = [''];
  for (let index = 0; index < count; index++) values = values.flatMap((prefix) => symbols.map((symbol) => `${prefix}${symbol}`));
  return values;
}

function focusRows(items) {
  return items.map((item) => `<div class="focus-row"><b>${item.label}</b><span>当前遗漏 <em>${item.omit}</em> 期</span></div>`).join('');
}

function balancedTop(ranking, count) {
  const chosen = ranking.slice(0, count).map((item) => item.digit);
  if (count > 1 && chosen.every((digit) => digit % 2 === chosen[0] % 2)) {
    const alternate = ranking.find((item) => !chosen.includes(item.digit) && item.digit % 2 !== chosen[0] % 2);
    if (alternate) chosen[chosen.length - 1] = alternate.digit;
  }
  if (count > 1 && chosen.every((digit) => (digit >= 5) === (chosen[0] >= 5))) {
    const alternate = ranking.find((item) => !chosen.includes(item.digit) && (item.digit >= 5) !== (chosen[0] >= 5));
    if (alternate) chosen[chosen.length - 1] = alternate.digit;
  }
  return [...new Set(chosen)].sort((a, b) => a - b);
}

const modelDefinitions = [
  ['hot20', '近20期热度'], ['bayes60', '60期贝叶斯'], ['stable300', '300期稳定频率'],
  ['decay', '指数衰减'], ['transition', '位置转移'], ['hazard', '遗漏危险率'],
  ['structure', '012/奇偶/大小'], ['pattern', '前期形态转移'], ['ensemble', '多模型融合']
];

function normalizeScores(scores) {
  const min = Math.min(...scores), max = Math.max(...scores);
  if (max === min) return scores.map(() => 1);
  return scores.map((score) => (score - min) / (max - min));
}

function frequencyScores(series, end, position, window, prior = .5) {
  const scores = Array(10).fill(prior);
  for (let index = Math.max(0, end - window); index < end; index++) scores[series[index][position]] += 1;
  return normalizeScores(scores);
}

function decayScores(series, end, position) {
  const scores = Array(10).fill(.25);
  for (let index = Math.max(0, end - 180); index < end; index++) {
    scores[series[index][position]] += Math.pow(.965, end - index - 1);
  }
  return normalizeScores(scores);
}

function transitionScores(series, end, position) {
  const scores = Array(10).fill(.4);
  const previousDigit = series[end - 1][position];
  for (let index = Math.max(1, end - 500); index < end; index++) {
    if (series[index - 1][position] === previousDigit) scores[series[index][position]] += 1;
  }
  const fallback = frequencyScores(series, end, position, 60);
  return normalizeScores(scores).map((score, digit) => score * .75 + fallback[digit] * .25);
}

function hazardScores(series, end, position) {
  const start = Math.max(0, end - 600);
  const longFrequency = frequencyScores(series, end, position, 300);
  return Array.from({ length: 10 }, (_, digit) => {
    const occurrences = [];
    for (let index = start; index < end; index++) if (series[index][position] === digit) occurrences.push(index);
    const last = occurrences.length ? occurrences[occurrences.length - 1] : start - 1;
    const currentGap = end - last - 1;
    const targetInterval = currentGap + 1;
    const intervals = occurrences.slice(1).map((index, i) => index - occurrences[i]);
    const eligible = intervals.filter((interval) => interval >= targetInterval).length;
    const exact = intervals.filter((interval) => interval === targetInterval).length;
    const empiricalHazard = (exact + 1) / (eligible + 10);
    return empiricalHazard * .8 + longFrequency[digit] * .2;
  });
}

function categoryTransitionScores(series, end, position, categoryCount, mapper) {
  const scores = Array(categoryCount).fill(.5);
  const previousCategory = mapper(series[end - 1][position]);
  for (let index = Math.max(1, end - 500); index < end; index++) {
    if (mapper(series[index - 1][position]) === previousCategory) scores[mapper(series[index][position])] += 1;
  }
  return normalizeScores(scores);
}

function structureScores(series, end, position) {
  const route = categoryTransitionScores(series, end, position, 3, (digit) => digit % 3);
  const parity = categoryTransitionScores(series, end, position, 2, (digit) => digit % 2);
  const size = categoryTransitionScores(series, end, position, 2, (digit) => digit >= 5 ? 1 : 0);
  const frequency = frequencyScores(series, end, position, 60);
  return Array.from({ length: 10 }, (_, digit) => route[digit % 3] * .4 + parity[digit % 2] * .2 + size[digit >= 5 ? 1 : 0] * .2 + frequency[digit] * .2);
}

function patternTransitionScores(series, end, position) {
  const scores = Array(10).fill(.4);
  const previousPattern = series[end - 1].map((digit) => digit % 3).join('');
  for (let index = Math.max(1, end - 600); index < end; index++) {
    if (series[index - 1].map((digit) => digit % 3).join('') === previousPattern) scores[series[index][position]] += 1;
  }
  const frequency = frequencyScores(series, end, position, 60);
  return normalizeScores(scores).map((score, digit) => score * .7 + frequency[digit] * .3);
}

function modelRankingsAt(series, end, position) {
  const scores = {
    hot20: frequencyScores(series, end, position, 20),
    bayes60: frequencyScores(series, end, position, 60, 1),
    stable300: frequencyScores(series, end, position, 300, 1),
    decay: decayScores(series, end, position),
    transition: transitionScores(series, end, position),
    hazard: normalizeScores(hazardScores(series, end, position)),
    structure: normalizeScores(structureScores(series, end, position)),
    pattern: normalizeScores(patternTransitionScores(series, end, position))
  };
  const ensembleInputs = ['bayes60', 'stable300', 'decay', 'transition', 'hazard', 'structure', 'pattern'];
  scores.ensemble = Array.from({ length: 10 }, (_, digit) => ensembleInputs.reduce((total, model) => total + scores[model][digit], 0) / ensembleInputs.length);
  return modelDefinitions.map(([id]) => Array.from({ length: 10 }, (_, digit) => ({ digit, score: scores[id][digit] }))
    .sort((a, b) => b.score - a.score || a.digit - b.digit).map((item) => item.digit));
}

function createBacktest(draws, lottery = state.lottery) {
  const signature = `${draws.length}:${draws[draws.length - 1]?.issue || ''}`;
  if (algorithmCaches[lottery]?.signature === signature) return algorithmCaches[lottery];
  const positionCount = lottery === 'pl3' ? 3 : 5;
  const series = draws.map((draw) => drawDigits(draw, positionCount));
  const start = Math.max(220, series.length - 600);
  const records = [];
  for (let end = start; end < series.length; end++) {
    records.push({
      actual: series[end],
      ranks: Array.from({ length: positionCount }, (_, position) => modelRankingsAt(series, end, position))
    });
  }
  algorithmCaches[lottery] = {
    signature,
    positionCount,
    records,
    currentRanks: Array.from({ length: positionCount }, (_, position) => modelRankingsAt(series, series.length, position)),
    plans: {}
  };
  return algorithmCaches[lottery];
}

function selectBacktestedPlan(backtest, count) {
  if (backtest.plans[count]) return backtest.plans[count];
  const modelCount = modelDefinitions.length;
  const split = Math.max(1, Math.floor(backtest.records.length * .7));
  const hitRows = backtest.records.map((record) => ({
    actual: record.actual,
    hits: record.ranks.map((positionRanks, position) => positionRanks.map((ranking) => ranking.slice(0, count).includes(record.actual[position])))
  }));
  const bestCombo = Array.from({ length: backtest.positionCount }, (_, position) => {
    let bestModel = modelCount - 1, bestPositionHits = -1;
    for (let model = 0; model < modelCount; model++) {
      const hits = hitRows.slice(0, split).filter((record) => record.hits[position][model]).length;
      if (hits > bestPositionHits || (hits === bestPositionHits && model === modelCount - 1)) {
        bestPositionHits = hits;
        bestModel = model;
      }
    }
    return bestModel;
  });
  const bestHits = hitRows.slice(0, split).filter((record) => bestCombo.every((model, position) => record.hits[position][model])).length;
  const validation = hitRows.slice(split);
  const validationHits = validation.filter((record) => bestCombo.every((model, position) => record.hits[position][model])).length;
  const validationPositionRates = bestCombo.map((model, position) => validation.length
    ? validation.filter((record) => record.hits[position][model]).length / validation.length : 0);
  const selectedRankings = bestCombo.map((model, position) => backtest.currentRanks[position][model]);
  const plan = {
    combo: bestCombo,
    modelNames: bestCombo.map((model) => modelDefinitions[model][1]),
    picks: selectedRankings.map((ranking) => ranking.slice(0, count).sort((a, b) => a - b)),
    rankings: selectedRankings,
    trainSize: split,
    validationSize: validation.length,
    trainRate: bestHits / split,
    validationHits,
    validationRate: validation.length ? validationHits / validation.length : 0,
    validationPositionRates,
    baseline: Math.pow(count / 10, backtest.positionCount)
  };
  backtest.plans[count] = plan;
  return plan;
}

function buildDailyOverview(draws, lottery) {
  const isPl3 = lottery === 'pl3';
  const names = isPl3 ? ['百位', '十位', '个位'] : ['万位', '千位', '百位', '十位', '个位'];
  const wideCount = isPl3 ? 6 : 3;
  const narrowCount = isPl3 ? 3 : 2;
  const backtest = createBacktest(draws, lottery);
  const narrowPlan = selectBacktestedPlan(backtest, narrowCount);
  const widePlan = selectBacktestedPlan(backtest, wideCount);
  overviewRecommendations[lottery].wide = widePlan.picks;
  overviewRecommendations[lottery].narrow = narrowPlan.picks;
  const aggregate = Array.from({ length: 10 }, (_, digit) => ({
    digit,
    score: narrowPlan.rankings.reduce((total, ranking) => total + (10 - ranking.indexOf(digit)), 0)
  })).sort((a, b) => b.score - a.score || a.digit - b.digit);
  const wideBets = wideCount ** names.length;
  const narrowBets = narrowCount ** names.length;
  $('#daily-wide-title').textContent = `${wideCount}码直选复式`;
  $('#daily-narrow-title').textContent = `${narrowCount}码直选复式`;
  $('#daily-six').textContent = widePlan.picks.map((list) => list.join('')).join('-');
  $('#daily-three').textContent = narrowPlan.picks.map((list) => list.join('')).join('-');
  $('#daily-six-note').textContent = `留出验证整注覆盖 ${(widePlan.validationRate * 100).toFixed(1)}% · 理论基线 ${(widePlan.baseline * 100).toFixed(1)}%`;
  $('#daily-three-note').textContent = `留出验证整注覆盖 ${(narrowPlan.validationRate * 100).toFixed(1)}% · 理论基线 ${(narrowPlan.baseline * 100).toFixed(1)}%`;
  $('#daily-six-meta').textContent = `${widePlan.validationHits}/${widePlan.validationSize}期 · ${wideBets * 2}元`;
  $('#daily-three-meta').textContent = `${narrowPlan.validationHits}/${narrowPlan.validationSize}期 · ${narrowBets * 2}元`;
  $('#algorithm-summary').textContent = `最近${backtest.records.length}期步进回测：前${narrowPlan.trainSize}期按分位命中率选模，后${narrowPlan.validationSize}期仅验证`;
  $('#algorithm-three-models').textContent = `${narrowCount}码：${names.map((name, position) => `${name.slice(0, 1)}${narrowPlan.modelNames[position]}`).join(' / ')}`;
  $('#algorithm-six-models').textContent = `${wideCount}码：${names.map((name, position) => `${name.slice(0, 1)}${widePlan.modelNames[position]}`).join(' / ')}`;

  if (isPl3) {
    const group3 = aggregate.slice(0, 2).map((item) => item.digit);
    const group6 = balancedTop(aggregate, 6);
    const [a, b] = group3;
    $('#daily-special-one-title').textContent = '组三参考';
    $('#daily-special-one-meta').textContent = '2组 · 4元';
    $('#daily-special-two-title').textContent = '组六6码复式';
    $('#daily-special-two-meta').textContent = '20注 · 40元';
    $('#daily-group3').textContent = `${a}${a}${b} / ${a}${b}${b}`;
    $('#daily-group3-detail').textContent = `${a}${a}${b}、${a}${b}${a}、${b}${a}${a}、${a}${b}${b}、${b}${a}${b}、${b}${b}${a}`;
    $('#daily-group6').textContent = group6.join(' ');
    $('#daily-group6-detail').textContent = '6个互异候选号，组合数C(6,3)';
  } else {
    const positionLine = narrowPlan.rankings.map((ranking) => ranking[0]);
    const routeLine = positionLine.map((digit) => digit % 3);
    $('#daily-special-one-title').textContent = '单码定位参考';
    $('#daily-special-one-meta').textContent = '1注 · 2元';
    $('#daily-special-two-title').textContent = '012路定位参考';
    $('#daily-special-two-meta').textContent = '结构观察';
    $('#daily-group3').textContent = positionLine.join(' ');
    $('#daily-group3-detail').textContent = names.map((name, position) => `${name}${positionLine[position]}`).join(' · ');
    $('#daily-group6').textContent = routeLine.join(' ');
    $('#daily-group6-detail').textContent = '万、千、百、十、个位依次对应的012路';
  }
}

function renderBacktestedRecommendation(count) {
  const plan = selectBacktestedPlan(createBacktest(state.draws, state.lottery), count);
  const picks = plan.picks;
  const names = positionNames;
  $('#number-picks').style.gridTemplateColumns = `repeat(${names.length}, minmax(90px, 1fr))`;
  $('#number-picks').innerHTML = picks.map((list, index) => `<div class="pick-column"><h3>${names[index]}</h3><div class="pick-digits">${list.map((number) => `<span class="pick-digit">${number}</span>`).join('')}</div></div>`).join('');
  const bets = count ** names.length;
  $('#ticket-code').textContent = picks.map((list) => list.join('')).join('-');
  $('#ticket-bets').textContent = `${bets}注`;
  $('#ticket-cost').textContent = `${bets * 2}元`;
  $('#ticket-probability').textContent = `理论概率 ${(bets / (10 ** names.length) * 100).toFixed(3)}%`;
  $('#reason-list').innerHTML = names.map((name, position) => `<div class="reason-item"><strong>${name}：${plan.modelNames[position]}</strong><span>最近${plan.validationSize}期留出分位覆盖率 ${(plan.validationPositionRates[position] * 100).toFixed(1)}%，该段未参与选模。</span></div>`).join('');
  $('#recommend-date').textContent = `滚动回测${plan.trainSize + plan.validationSize}期 · 留出整注覆盖 ${(plan.validationRate * 100).toFixed(1)}% · 理论基线 ${(plan.baseline * 100).toFixed(1)}%`;
  $('.model-controls h2').textContent = '回测自动选模';
  $('.model-badge').textContent = '样本外验证版';
  $('#generate-button').textContent = '重新回测';
  ['model-window', 'omit-weight', 'freq-weight', 'balance-toggle'].forEach((id) => { $(`#${id}`).disabled = true; });
}

function pl5WideFocus(draws) {
  const pl5Distribution = rankedOmissions(draws, pl5Distributions, (draw) => {
    const ds = drawDigits(draw, 5); return [0, 1, 2].map((route) => ds.filter((digit) => digit % 3 === route).length).join('');
  }, 5).map((item) => ({ ...item, label: `012比 ${item.label}` }));
  const pl5Names = ['万位', '千位', '百位', '十位', '个位'];
  const pl5Positions = pl5Names.map((name, position) => {
    const item = rankedOmissions(draws, Array.from({ length: 10 }, (_, digit) => digit), (draw) => drawDigits(draw, 5)[position], 1)[0];
    return { ...item, label: `${name} ${item.label}` };
  });
  return [...pl5Distribution, ...pl5Positions];
}

function renderPl3OverviewFocus(pl3, pl5) {
  $('#focus-route-title').textContent = '012直选形态';
  $('#focus-route-meta').textContent = '27种';
  $('#focus-position-meta').textContent = '百十个';
  $('#focus-group-title').textContent = '组三组六形态';
  $('#focus-group-meta').textContent = '组选';
  $('#focus-wide-title').textContent = '排列五012分布与定位关注';
  $('#focus-wide-meta').textContent = '同步观察';
  const directFocus = rankedOmissions(pl3, directRoutes, (draw) => drawDigits(draw, 3).map((digit) => digit % 3).join(''), 5)
    .map((item) => ({ ...item, label: `${item.label}路` }));
  $('#focus-route').innerHTML = focusRows(directFocus);
  const names = ['百位', '十位', '个位'];
  $('#focus-position').innerHTML = focusRows(names.flatMap((name, position) => rankedOmissions(pl3, Array.from({ length: 10 }, (_, digit) => digit), (draw) => drawDigits(draw, 3)[position], 2)
    .map((item) => ({ ...item, label: `${name} ${item.label}` }))));
  const oddFocus = rankedOmissions(pl3, patternList(['偶', '奇'], 3), (draw) => drawDigits(draw, 3).map((digit) => digit % 2 ? '奇' : '偶').join(''), 2)
    .map((item) => ({ ...item, label: `奇偶 ${item.label}` }));
  const sizeFocus = rankedOmissions(pl3, patternList(['小', '大'], 3), (draw) => drawDigits(draw, 3).map((digit) => digit >= 5 ? '大' : '小').join(''), 2)
    .map((item) => ({ ...item, label: `大小 ${item.label}` }));
  const zoneFocus = rankedOmissions(pl3, patternList(['小', '中', '大'], 3), (draw) => drawDigits(draw, 3).map((digit) => digit <= 2 ? '小' : digit <= 6 ? '中' : '大').join(''), 2)
    .map((item) => ({ ...item, label: `三区 ${item.label}` }));
  const sumFocus = rankedOmissions(pl3, Array.from({ length: 28 }, (_, value) => value), (draw) => sum(drawDigits(draw, 3)), 1).map((item) => ({ ...item, label: `和值 ${item.label}` }));
  const spanFocus = rankedOmissions(pl3, Array.from({ length: 10 }, (_, value) => value), (draw) => { const ds = drawDigits(draw, 3); return Math.max(...ds) - Math.min(...ds); }, 1).map((item) => ({ ...item, label: `跨度 ${item.label}` }));
  $('#focus-structure').innerHTML = focusRows([...oddFocus, ...sizeFocus, ...zoneFocus, ...sumFocus, ...spanFocus]);
  const groupFocus = rankedOmissions(pl3, ['豹子', '组三', '组六'], (draw) => ['', '豹子', '组三', '组六'][new Set(drawDigits(draw, 3)).size], 3);
  const tailFocus = rankedOmissions(pl3, Array.from({ length: 10 }, (_, value) => value), (draw) => sum(drawDigits(draw, 3)) % 10, 2).map((item) => ({ ...item, label: `和尾 ${item.label}` }));
  $('#focus-group-type').innerHTML = focusRows([...groupFocus, ...tailFocus]);
  $('#focus-pl5').innerHTML = focusRows(pl5WideFocus(pl5));
}

function renderPl5OverviewFocus(pl5) {
  $('#focus-route-title').textContent = '012直选形态';
  $('#focus-route-meta').textContent = '243种';
  $('#focus-position-meta').textContent = '万千百十个';
  $('#focus-group-title').textContent = '重复形态与和尾';
  $('#focus-group-meta').textContent = '形态';
  $('#focus-wide-title').textContent = '排列五012分布与定位关注';
  $('#focus-wide-meta').textContent = '综合观察';
  const routeFocus = rankedOmissions(pl5, pl5DirectRoutes, (draw) => drawDigits(draw, 5).map((digit) => digit % 3).join(''), 5)
    .map((item) => ({ ...item, label: `${item.label}路` }));
  $('#focus-route').innerHTML = focusRows(routeFocus);
  const names = ['万位', '千位', '百位', '十位', '个位'];
  $('#focus-position').innerHTML = focusRows(names.flatMap((name, position) => rankedOmissions(pl5, Array.from({ length: 10 }, (_, digit) => digit), (draw) => drawDigits(draw, 5)[position], 2)
    .map((item) => ({ ...item, label: `${name} ${item.label}` }))));
  const oddFocus = rankedOmissions(pl5, patternList(['偶', '奇'], 5), (draw) => drawDigits(draw, 5).map((digit) => digit % 2 ? '奇' : '偶').join(''), 2)
    .map((item) => ({ ...item, label: `奇偶 ${item.label}` }));
  const sizeFocus = rankedOmissions(pl5, patternList(['小', '大'], 5), (draw) => drawDigits(draw, 5).map((digit) => digit >= 5 ? '大' : '小').join(''), 2)
    .map((item) => ({ ...item, label: `大小 ${item.label}` }));
  const zoneFocus = rankedOmissions(pl5, patternList(['小', '中', '大'], 5), (draw) => drawDigits(draw, 5).map((digit) => digit <= 2 ? '小' : digit <= 6 ? '中' : '大').join(''), 2)
    .map((item) => ({ ...item, label: `三区 ${item.label}` }));
  const sumFocus = rankedOmissions(pl5, Array.from({ length: 46 }, (_, value) => value), (draw) => sum(drawDigits(draw, 5)), 1).map((item) => ({ ...item, label: `和值 ${item.label}` }));
  const spanFocus = rankedOmissions(pl5, Array.from({ length: 10 }, (_, value) => value), (draw) => { const ds = drawDigits(draw, 5); return Math.max(...ds) - Math.min(...ds); }, 1).map((item) => ({ ...item, label: `跨度 ${item.label}` }));
  $('#focus-structure').innerHTML = focusRows([...oddFocus, ...sizeFocus, ...zoneFocus, ...sumFocus, ...spanFocus]);
  const repeatFocus = rankedOmissions(pl5, [1, 2, 3, 4, 5], (draw) => new Set(drawDigits(draw, 5)).size, 5)
    .map((item) => ({ ...item, label: `${item.label}种号` }));
  const tailFocus = rankedOmissions(pl5, Array.from({ length: 10 }, (_, value) => value), (draw) => sum(drawDigits(draw, 5)) % 10, 2).map((item) => ({ ...item, label: `和尾 ${item.label}` }));
  $('#focus-group-type').innerHTML = focusRows([...repeatFocus, ...tailFocus]);
  $('#focus-pl5').innerHTML = focusRows(pl5WideFocus(pl5));
}

function renderOverview() {
  const pl3 = overviewData.pl3;
  const pl5 = overviewData.pl5;
  if (!pl3.length || !pl5.length) return;
  const pl3Latest = pl3[pl3.length - 1];
  const pl5Latest = pl5[pl5.length - 1];
  const activeDraws = overviewData[state.lottery];
  const activeLatest = activeDraws[activeDraws.length - 1];
  $('#overview-pl3-latest').textContent = drawDigits(pl3Latest, 3).join(' ');
  $('#overview-pl3-issue').textContent = `${pl3Latest.issue}期 · ${pl3Latest.kjdate}`;
  $('#overview-pl5-latest').textContent = drawDigits(pl5Latest, 5).join(' ');
  $('#overview-pl5-issue').textContent = `${pl5Latest.issue}期 · ${pl5Latest.kjdate}`;
  $('#overview-pl3-latest').closest('div').classList.toggle('active', state.lottery === 'pl3');
  $('#overview-pl5-latest').closest('div').classList.toggle('active', state.lottery === 'pl5');
  $('#overview-title').textContent = `${lotteryName()}今日研判`;
  $('#overview-lottery-badge').textContent = lotteryName();
  $('#overview-date').textContent = `${new Date().toISOString().slice(0, 10)} · 数据更新至${activeLatest.issue}期 · 每日方案已固定`;
  $('#open-pl3-route').textContent = state.lottery === 'pl3' ? '查看012直选图' : '查看012走势图';
  buildDailyOverview(activeDraws, state.lottery);
  if (state.lottery === 'pl3') renderPl3OverviewFocus(pl3, pl5);
  else renderPl5OverviewFocus(pl5);
}

async function loadOverviewData(refresh = false) {
  const missing = ['pl3', 'pl5'].filter((lottery) => refresh || !overviewData[lottery].length);
  await Promise.all(missing.map(async (lottery) => {
    const response = await fetch(`/api/draws?lottery=${lottery}&limit=10000${refresh ? '&refresh=1' : ''}`);
    const result = await response.json();
    overviewData[lottery] = result.data;
  }));
  renderOverview();
}

function generateRecommendation() {
  const count = Number($('#digits-slider').value);
  if (state.lottery === 'pl3' && state.draws.length) {
    renderBacktestedRecommendation(count);
    return;
  }
  $('.model-controls h2').textContent = '模型偏好';
  $('.model-badge').textContent = '每日固定版';
  $('#generate-button').textContent = '重新计算';
  ['model-window', 'omit-weight', 'freq-weight', 'balance-toggle'].forEach((id) => { $(`#${id}`).disabled = false; });
  const windowSize = Number($('#model-window').value);
  const omitWeight = Number($('#omit-weight').value) / 100;
  const freqWeight = Number($('#freq-weight').value) / 100;
  const balance = $('#balance-toggle').checked;
  const sample = state.draws.slice(-windowSize);
  const today = new Date().toISOString().slice(0, 10);
  const random = seededNoise(Number(today.replaceAll('-', '')));
  const picks = [];
  const reasons = [];
  for (let p = 0; p < digitCount(); p++) {
    const frequency = Array(10).fill(0);
    sample.forEach((draw) => frequency[digits(draw)[p]]++);
    const omission = Array(10).fill(0);
    for (let n = 0; n < 10; n++) {
      const last = [...state.draws].reverse().findIndex((draw) => digits(draw)[p] === n);
      omission[n] = last < 0 ? state.draws.length : last;
    }
    const maxFreq = Math.max(...frequency, 1), maxOmit = Math.max(...omission, 1);
    const scored = Array.from({ length: 10 }, (_, n) => ({ n, score: (frequency[n] / maxFreq) * freqWeight + (omission[n] / maxOmit) * omitWeight + random() * .08 }));
    scored.sort((a, b) => b.score - a.score);
    let chosen = scored.slice(0, count).map((x) => x.n);
    if (balance && count > 1 && chosen.every((n) => n % 2 === chosen[0] % 2)) {
      const replacement = scored.find((x) => !chosen.includes(x.n) && x.n % 2 !== chosen[0] % 2);
      chosen[chosen.length - 1] = replacement.n;
    }
    if (balance && count > 1 && chosen.every((n) => (n >= 5) === (chosen[0] >= 5))) {
      const replacement = scored.find((x) => !chosen.includes(x.n) && (x.n >= 5) !== (chosen[0] >= 5));
      chosen[chosen.length - 1] = replacement.n;
    }
    chosen.sort((a, b) => a - b); picks.push(chosen);
    const lead = scored[0].n;
    reasons.push(`<div class="reason-item"><strong>${positionNames[p]}：${chosen.join('、')}</strong><span>${lead}综合分最高；该位当前遗漏${omission[lead]}期，近${windowSize}期出现${frequency[lead]}次。</span></div>`);
  }
  $('#number-picks').style.gridTemplateColumns = `repeat(${digitCount()}, minmax(90px, 1fr))`;
  $('#number-picks').innerHTML = picks.map((list, index) => `<div class="pick-column"><h3>${positionNames[index]}</h3><div class="pick-digits">${list.map((n) => `<span class="pick-digit">${n}</span>`).join('')}</div></div>`).join('');
  const bets = count ** digitCount();
  $('#ticket-code').textContent = picks.map((list) => list.join('')).join('-');
  $('#ticket-bets').textContent = `${bets}注`;
  $('#ticket-cost').textContent = `${bets * 2}元`;
  $('#ticket-probability').textContent = `理论概率 ${(bets / (10 ** digitCount()) * 100).toFixed(3)}%`;
  $('#reason-list').innerHTML = reasons.join('');
  $('#recommend-date').textContent = `${today} · 基于最新${windowSize}期统计，今日重复计算结果保持一致`;
}

function renderHistory(query = '') {
  const rows = state.draws.slice().reverse().filter((draw) => `${draw.issue}${String(draw.winnum).replace(/\s/g, '')}`.includes(query)).slice(0, 500);
  $('#history-body').innerHTML = rows.map((draw, i) => {
    const previous = state.draws[state.draws.indexOf(draw) - 1];
    const m = metrics(draw, previous);
    return `<tr><td>${draw.issue}</td><td>${draw.kjdate}</td><td class="number">${m.ds.join(' ')}</td><td>${m.total}</td><td>${m.span}</td><td>${m.route}</td><td>${m.odd}</td><td>${m.big}</td></tr>`;
  }).join('');
}

function sortedPicks(position) {
  return [...selectorState.picks[position]].sort((a, b) => a - b);
}

function discardGeneratedTickets() {
  if (!selectorState.generatedTickets.length) return;
  selectorState.generatedTickets = [];
  selectorState.picks = selectorState.picks.map((pick, position) => selectorState.locked[position] ? new Set(pick) : new Set());
}

function selectorTotals() {
  const counts = selectorState.picks.map((pick) => pick.size);
  const complete = counts.every(Boolean);
  const hasDan = selectorState.locked.some(Boolean);
  const validDan = selectorState.locked.every((locked, index) => !locked || counts[index] === 1);
  const valid = complete && (selectorState.mode !== 'dantuo' || (hasDan && validDan));
  return { counts, complete, hasDan, validDan, valid, bets: valid ? counts.reduce((total, count) => total * count, 1) : 0 };
}

function numericFilter(id) {
  const value = Number($(`#${id}`).value);
  return Number.isFinite(value) && $(`#${id}`).value !== '' ? value : null;
}

function combinationMatches(number) {
  if (selectorState.mode !== 'filter') return true;
  const ds = number.split('').map(Number);
  const total = sum(ds);
  const span = Math.max(...ds) - Math.min(...ds);
  const sumMin = numericFilter('sum-min'), sumMax = numericFilter('sum-max');
  const spanMin = numericFilter('span-min'), spanMax = numericFilter('span-max');
  if (sumMin !== null && total < sumMin) return false;
  if (sumMax !== null && total > sumMax) return false;
  if (spanMin !== null && span < spanMin) return false;
  if (spanMax !== null && span > spanMax) return false;
  const values = {
    oddCounts: ds.filter((digit) => digit % 2).length,
    bigCounts: ds.filter((digit) => digit >= 5).length,
    primeCounts: ds.filter(isPrime).length,
    distinctCounts: new Set(ds).size,
    route0Counts: ds.filter((digit) => digit % 3 === 0).length,
    route1Counts: ds.filter((digit) => digit % 3 === 1).length,
    route2Counts: ds.filter((digit) => digit % 3 === 2).length
  };
  for (const [filter, value] of Object.entries(values)) {
    const selected = selectorState.filters[filter];
    if (selected.size && !selected.has(value)) return false;
  }
  if (selectorState.filters.consecutive !== 'any') {
    const unique = [...new Set(ds)].sort((a, b) => a - b);
    const hasConsecutive = unique.some((digit, index) => index > 0 && digit - unique[index - 1] === 1);
    if ((selectorState.filters.consecutive === 'yes') !== hasConsecutive) return false;
  }
  return true;
}

function ticketCombinations(limit = 200) {
  const totals = selectorTotals();
  if (!totals.valid) return { items: [], total: 0 };
  if (selectorState.mode === 'dantuo' && selectorState.generatedTickets.length) {
    return { items: selectorState.generatedTickets.slice(0, limit), total: selectorState.generatedTickets.length };
  }
  const lists = selectorState.picks.map((_, index) => sortedPicks(index));
  const items = [];
  let total = 0;
  const visit = (position, number) => {
    if (position === lists.length) {
      if (combinationMatches(number)) {
        total += 1;
        if (items.length < limit) items.push(number);
      }
      return;
    }
    lists[position].forEach((digit) => visit(position + 1, `${number}${digit}`));
  };
  visit(0, '');
  return { items, total };
}

function normalizedMultiple() {
  const input = $('#ticket-multiple');
  const value = Math.min(999, Math.max(1, Math.floor(Number(input.value) || 1)));
  input.value = value;
  return value;
}

function updateTicketCalculator() {
  const totals = selectorTotals();
  const multiple = normalizedMultiple();
  const budgetInput = $('#ticket-budget');
  const budget = Math.max(0, Math.floor(Number(budgetInput.value) || 0));
  const combinations = ticketCombinations();
  const bets = combinations.total;
  const cost = bets * 2 * multiple;
  const notation = selectorState.picks.map((_, index) => sortedPicks(index).join('')).join('-');

  $('#calc-bets').textContent = `${bets.toLocaleString()}注`;
  $('#calc-cost').textContent = `${cost.toLocaleString()}元`;
  $('#calc-probability').textContent = `${(bets / (10 ** digitCount()) * 100).toFixed(bets ? 3 : 0)}%`;
  $('#calc-prize').textContent = `${((state.lottery === 'pl3' ? 1040 : 100000) * multiple).toLocaleString()}元`;
  $('#budget-hint').textContent = `当前预算最多可买${Math.floor(budget / (2 * multiple)).toLocaleString()}注（${multiple}倍）`;
  const generatedDan = selectorState.mode === 'dantuo' && selectorState.generatedTickets.length;
  $('#ticket-notation').textContent = totals.complete ? (selectorState.mode === 'filter' ? '条件缩水' : generatedDan ? '胆码机选' : notation) : '--';
  $('#preview-summary').textContent = totals.valid
    ? `共${bets.toLocaleString()}注，${bets > combinations.items.length ? `显示前${combinations.items.length}注` : '已全部展开'}`
    : `请为${digitCount()}个位置选择号码`;
  $('#combination-list').innerHTML = combinations.items.length
    ? combinations.items.map((number) => `<span class="combination-number">${number}</span>`).join('')
    : `<span class="combination-empty">${totals.valid && selectorState.mode === 'filter' ? '当前条件没有保留任何号码，请放宽条件。' : '完成选号后，这里会展开每一注单式号码。'}</span>`;

  $('#filter-base-bets').textContent = totals.bets.toLocaleString();
  $('#filter-kept-bets').textContent = bets.toLocaleString();
  $('#filter-keep-rate').textContent = totals.bets ? `${(bets / totals.bets * 100).toFixed(2)}%` : '0%';

  let warning = '每注2元，倍数只放大金额和返奖，不提高单注概率。';
  if (selectorState.mode === 'dantuo' && !totals.hasDan) warning = '请先点击某个位置的“设胆”，再选1个胆码。';
  else if (selectorState.mode === 'dantuo' && !totals.validDan) warning = '每个胆码位置只能选1个号码。';
  else if (selectorState.mode === 'dantuo' && !totals.complete) {
    const emptyPositions = positionNames.filter((_, index) => selectorState.picks[index].size === 0);
    warning = `胆码已选：可直接设置机选注数，或手动选择${emptyPositions.join('、')}的拖码。`;
  }
  else if (!totals.complete) warning = `${digitCount()}个位置都至少需要选1个号码。`;
  else if (selectorState.mode === 'filter' && bets === 0) warning = '当前条件互相冲突，筛选结果为0注。';
  else if (cost > budget) warning = `当前金额超出预算${(cost - budget).toLocaleString()}元，可减少号码或倍数。`;
  else if (generatedDan) warning = `已按胆码生成${bets}注不重复号码；重新手选会清除本次机选结果。`;
  else if (totals.valid) warning = `预算剩余${(budget - cost).toLocaleString()}元；理论概率仅按覆盖${bets.toLocaleString()}个${digitCount()}位数计算。`;
  $('#selector-warning').textContent = warning;
  $('#copy-ticket').disabled = !totals.valid || bets === 0;
}

function renderSelector() {
  $('#selector-title').textContent = `${lotteryName()}选号工具`;
  $('#position-selector').style.gridTemplateColumns = `repeat(${digitCount()}, minmax(132px, 1fr))`;
  document.querySelectorAll('.mode-button').forEach((button) => button.classList.toggle('active', button.dataset.pickMode === selectorState.mode));
  $('#filter-panel').classList.toggle('active', selectorState.mode === 'filter');
  $('#random-count-wrap').classList.toggle('show', selectorState.mode === 'dantuo');
  $('#position-selector').innerHTML = positionNames.map((name, position) => {
    const selected = selectorState.picks[position];
    const locked = selectorState.locked[position];
    const label = selectorState.mode === 'dantuo' ? (locked ? `胆码 · ${selected.size}个` : `拖码 · ${selected.size}个`) : `${selectorState.mode === 'filter' ? '候选' : '已选'} ${selected.size}个`;
    return `<article class="position-pick">
      <header><strong>${name}</strong><button class="lock-button ${locked ? 'active' : ''}" data-lock-position="${position}" title="${locked ? '取消胆码' : '设为胆码'}" ${selectorState.mode === 'dantuo' ? '' : 'disabled'}>${locked ? '胆码' : '设胆'}</button></header>
      <div class="digit-grid">${Array.from({ length: 10 }, (_, digit) => `<button class="digit-button ${selected.has(digit) ? 'selected' : ''}" data-position="${position}" data-digit="${digit}" aria-pressed="${selected.has(digit)}">${digit}</button>`).join('')}</div>
      <div class="position-count">${label}</div>
    </article>`;
  }).join('');
  renderFilterPanel();
  updateTicketCalculator();
}

function renderFilterPanel() {
  document.querySelectorAll('#filter-panel .filter-options[data-filter]').forEach((group) => {
    const filter = group.dataset.filter;
    if (filter === 'consecutive') {
      group.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.value === selectorState.filters.consecutive));
      return;
    }
    const start = Number(group.dataset.start || 0);
    group.innerHTML = Array.from({ length: digitCount() + 1 - start }, (_, index) => index + start)
      .map((value) => `<button data-value="${value}">${value}</button>`).join('');
    group.querySelectorAll('button').forEach((button) => button.classList.toggle('active', selectorState.filters[filter].has(Number(button.dataset.value))));
  });
}

function setSelectorMode(mode) {
  if (selectorState.mode !== mode) discardGeneratedTickets();
  selectorState.mode = mode;
  if (mode !== 'dantuo') selectorState.locked.fill(false);
  if (mode === 'filter' && !selectorState.filterInitialized) {
    selectorState.picks = Array.from({ length: digitCount() }, () => new Set(Array.from({ length: 10 }, (_, digit) => digit)));
    selectorState.filterInitialized = true;
  }
  if (mode === 'single') {
    selectorState.picks.forEach((pick, index) => {
      const first = sortedPicks(index)[0];
      selectorState.picks[index] = new Set(first === undefined ? [] : [first]);
    });
  }
  if (mode === 'dantuo' && !selectorState.locked.some(Boolean)) {
    selectorState.locked[0] = true;
    const first = sortedPicks(0)[0];
    selectorState.picks[0] = new Set(first === undefined ? [] : [first]);
  }
  renderSelector();
}

function randomDigits(count) {
  const pool = Array.from({ length: 10 }, (_, digit) => digit);
  for (let index = pool.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  return pool.slice(0, count);
}

function randomSelectorPick() {
  if (selectorState.mode === 'dantuo') {
    generateDanRandomTickets();
    return;
  }
  selectorState.picks = selectorState.picks.map((_, position) => {
    const count = selectorState.mode === 'single' || selectorState.locked[position] ? 1 : 2;
    return new Set(randomDigits(count));
  });
  renderSelector();
  toast('已生成一组随机号码');
}

function generateDanRandomTickets() {
  const danPositions = selectorState.locked.map((locked, index) => locked ? index : -1).filter((index) => index >= 0);
  if (!danPositions.length) {
    toast('请先设置至少1个胆码位置');
    return;
  }
  if (danPositions.some((position) => selectorState.picks[position].size !== 1)) {
    toast('每个胆码位置必须选1个号码');
    return;
  }
  const input = $('#random-ticket-count');
  const requested = Math.min(500, Math.max(1, Math.floor(Number(input.value) || 1)));
  const dragPositions = selectorState.locked.map((locked, index) => !locked ? index : -1).filter((index) => index >= 0);
  const count = Math.min(requested, 10 ** dragPositions.length);
  input.value = count;
  const tickets = new Set();
  while (tickets.size < count) {
    const number = selectorState.locked.map((locked, position) => locked ? sortedPicks(position)[0] : Math.floor(Math.random() * 10)).join('');
    tickets.add(number);
  }
  selectorState.generatedTickets = [...tickets];
  selectorState.picks = selectorState.picks.map((pick, position) => selectorState.locked[position]
    ? new Set(pick)
    : new Set(selectorState.generatedTickets.map((number) => Number(number[position]))));
  renderSelector();
  toast(`已按胆码生成${count}注号码`);
}

function copyTicketNotation() {
  const totals = selectorTotals();
  if (!totals.valid) return;
  const notation = selectorState.picks.map((_, index) => sortedPicks(index).join('')).join('-');
  const copyGenerated = selectorState.mode === 'dantuo' && selectorState.generatedTickets.length;
  const calculation = ticketCombinations(selectorState.mode === 'filter' || copyGenerated ? 100000 : 0);
  if (!calculation.total) return;
  const listedNumbers = selectorState.mode === 'filter' || copyGenerated ? `\n${calculation.items.join(' ')}` : '';
  const ticketType = selectorState.mode === 'filter' ? '条件缩水' : copyGenerated ? '胆码机选' : notation;
  const text = `${lotteryName()} ${ticketType} ${normalizedMultiple()}倍，共${calculation.total}注${calculation.total * 2 * normalizedMultiple()}元${listedNumbers}`;
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback);
  else fallback();
  toast('投注格式已复制');
}

function showView(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `${view}-view`));
  $('.sidebar').style.display = view === 'trend' ? '' : 'none';
  $('.shell').style.gridTemplateColumns = view === 'trend' ? '190px minmax(0, 1fr)' : '1fr';
  $('.toolbar').style.display = view === 'trend' ? '' : 'none';
  $('.summary-strip').style.display = view === 'trend' ? '' : 'none';
  if (view === 'overview') renderOverview();
  if (view === 'recommend') generateRecommendation();
  if (view === 'history') renderHistory($('#history-search').value.trim());
  if (view === 'selector') renderSelector();
}

function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 1800);
}

function applyCustomPeriod() {
  const input = $('#custom-period');
  if (!state.draws.length) {
    toast('开奖数据仍在加载，请稍候');
    return;
  }
  const requested = Math.floor(Number(input.value));
  if (!Number.isFinite(requested) || requested < 1) {
    toast('请输入大于0的期数');
    input.focus();
    return;
  }
  const total = state.draws.length;
  state.periods = Math.min(requested, total);
  input.value = state.periods;
  if (requested > total) toast(`当前共${total}期，已显示全部历史`);
  else toast(`已切换为近${state.periods}期`);
  renderTrend();
}

async function loadData(refresh = false) {
  $('#refresh-button').disabled = true;
  try {
    const response = await fetch(`/api/draws?lottery=${state.lottery}&limit=10000${refresh ? '&refresh=1' : ''}`);
    const result = await response.json();
    state.draws = result.data;
    overviewData[state.lottery] = result.data;
    $('#custom-period').max = state.draws.length;
    $('#custom-period').title = `可输入1至${state.draws.length}期`;
    const latest = state.draws[state.draws.length - 1];
    $('#latest-number').textContent = digits(latest).join(' ');
    $('#latest-issue').textContent = `${latest.issue}期 · ${latest.kjdate}`;
    renderTrend(); generateRecommendation(); renderOverview();
    if (refresh) toast('开奖数据已刷新');
  } catch (error) {
    toast('数据加载失败，请稍后重试');
  } finally { $('#refresh-button').disabled = false; }
}

async function switchLottery(lottery) {
  if (lottery === state.lottery) return;
  state.lottery = lottery;
  refreshLotteryConfig();
  if (!trendModes.some(([id]) => id === state.mode)) state.mode = 'position';
  selectorState.picks = Array.from({ length: digitCount() }, () => new Set());
  selectorState.locked = Array(digitCount()).fill(false);
  selectorState.generatedTickets = [];
  selectorState.filterInitialized = false;
  Object.values(selectorState.filters).forEach((value) => { if (value instanceof Set) value.clear(); });
  selectorState.filters.consecutive = 'any';
  document.querySelectorAll('[data-lottery]').forEach((button) => button.classList.toggle('active', button.dataset.lottery === lottery));
  $('#brand-mark').textContent = lottery === 'pl3' ? '3' : '5';
  document.title = `${lotteryName()}研判台`;
  $('#sum-min').max = digitCount() * 9;
  $('#sum-max').max = digitCount() * 9;
  $('#sum-filter-help').textContent = `${digitCount()}位数字之和，范围0-${digitCount() * 9}`;
  $('#distinct-filter-help').textContent = `${digitCount()}表示${digitCount()}个数字全不同`;
  buildMenu();
  renderSelector();
  await loadData();
  showView(state.view);
}

async function useOverviewPick(key) {
  const picks = overviewRecommendations[state.lottery][key];
  if (!picks?.length) return;
  selectorState.mode = 'compound';
  selectorState.picks = picks.map((list) => new Set(list));
  selectorState.locked = Array(digitCount()).fill(false);
  selectorState.generatedTickets = [];
  showView('selector');
  renderSelector();
  toast(`已带入${picks[0].length}码直选复式`);
}

function openOverviewRoute() {
  state.mode = state.lottery === 'pl3' ? 'route-direct' : 'route-main';
  buildMenu();
  showView('trend');
  renderTrend();
}

refreshLotteryConfig();
buildMenu();
document.querySelectorAll('[data-lottery]').forEach((button) => button.addEventListener('click', () => switchLottery(button.dataset.lottery)));
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-use-overview]').forEach((button) => button.addEventListener('click', () => useOverviewPick(button.dataset.useOverview)));
$('#open-pl3-route').addEventListener('click', openOverviewRoute);
$('#period-select').addEventListener('change', (event) => {
  const value = event.target.value;
  $('#custom-period-wrap').classList.toggle('show', value === 'custom');
  if (value === 'custom') {
    $('#custom-period').focus();
    return;
  }
  if (!state.draws.length) {
    toast('开奖数据仍在加载，请稍候');
    return;
  }
  state.periods = value === 'all' ? state.draws.length : Number(value);
  renderTrend();
});
$('#apply-period').addEventListener('click', applyCustomPeriod);
$('#custom-period').addEventListener('keydown', (event) => { if (event.key === 'Enter') applyCustomPeriod(); });
$('#line-toggle').addEventListener('click', () => { state.lines = !state.lines; $('#line-toggle').classList.toggle('active', state.lines); drawLines(); });
$('#refresh-button').addEventListener('click', () => loadData(true));
$('#digits-slider').addEventListener('input', (event) => { $('#digits-output').textContent = event.target.value; });
$('#generate-button').addEventListener('click', () => { generateRecommendation(); toast('已按当前参数重新计算'); });
$('#history-search').addEventListener('input', (event) => renderHistory(event.target.value.trim()));
document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => setSelectorMode(button.dataset.pickMode)));
$('#position-selector').addEventListener('click', (event) => {
  const digitButton = event.target.closest('[data-digit]');
  const lockButton = event.target.closest('[data-lock-position]');
  if (digitButton) {
    discardGeneratedTickets();
    const position = Number(digitButton.dataset.position);
    const digit = Number(digitButton.dataset.digit);
    const pick = selectorState.picks[position];
    if (selectorState.mode === 'single' || selectorState.locked[position]) {
      selectorState.picks[position] = new Set(pick.has(digit) && pick.size === 1 ? [] : [digit]);
    } else if (pick.has(digit)) pick.delete(digit);
    else pick.add(digit);
    renderSelector();
  }
  if (lockButton && selectorState.mode === 'dantuo') {
    discardGeneratedTickets();
    const position = Number(lockButton.dataset.lockPosition);
    selectorState.locked[position] = !selectorState.locked[position];
    if (selectorState.locked[position] && selectorState.picks[position].size > 1) {
      selectorState.picks[position] = new Set([sortedPicks(position)[0]]);
    }
    renderSelector();
  }
});
$('#random-pick').addEventListener('click', randomSelectorPick);
$('#select-all-pick').addEventListener('click', () => {
  selectorState.generatedTickets = [];
  const allDigits = Array.from({ length: 10 }, (_, digit) => digit);
  selectorState.picks = selectorState.picks.map((pick, position) => selectorState.mode === 'dantuo' && selectorState.locked[position]
    ? new Set(pick)
    : new Set(allDigits));
  renderSelector();
  toast(selectorState.mode === 'dantuo' ? '拖码位置已全选' : `${digitCount()}个位置已全选`);
});
$('#clear-pick').addEventListener('click', () => {
  selectorState.generatedTickets = [];
  selectorState.picks = Array.from({ length: digitCount() }, () => new Set());
  renderSelector();
  toast('已清空选号');
});
$('#filter-panel').addEventListener('click', (event) => {
  const button = event.target.closest('.filter-options button');
  if (!button) return;
  const group = button.closest('[data-filter]');
  const filter = group.dataset.filter;
  if (filter === 'consecutive') selectorState.filters.consecutive = button.dataset.value;
  else {
    const value = Number(button.dataset.value);
    if (selectorState.filters[filter].has(value)) selectorState.filters[filter].delete(value);
    else selectorState.filters[filter].add(value);
  }
  renderFilterPanel();
  updateTicketCalculator();
});
['sum-min', 'sum-max', 'span-min', 'span-max'].forEach((id) => $(`#${id}`).addEventListener('input', updateTicketCalculator));
$('#reset-filters').addEventListener('click', () => {
  Object.entries(selectorState.filters).forEach(([filter, value]) => {
    if (value instanceof Set) value.clear();
    else selectorState.filters[filter] = 'any';
  });
  ['sum-min', 'sum-max', 'span-min', 'span-max'].forEach((id) => { $(`#${id}`).value = ''; });
  renderFilterPanel();
  updateTicketCalculator();
  toast('缩水条件已重置');
});
$('#ticket-multiple').addEventListener('input', updateTicketCalculator);
$('#ticket-budget').addEventListener('input', updateTicketCalculator);
$('#minus-multiple').addEventListener('click', () => { $('#ticket-multiple').value = normalizedMultiple() - 1; updateTicketCalculator(); });
$('#plus-multiple').addEventListener('click', () => { $('#ticket-multiple').value = normalizedMultiple() + 1; updateTicketCalculator(); });
$('#copy-ticket').addEventListener('click', copyTicketNotation);
window.addEventListener('resize', drawLines);
renderSelector();
showView('overview');
loadData().then(() => loadOverviewData()).catch(() => toast('主板数据加载失败，请稍后刷新'));
