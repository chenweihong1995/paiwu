const state = { draws: [], periods: 50, mode: 'position', lines: true, view: 'trend' };
const positionNames = ['万位', '千位', '百位', '十位', '个位'];
const trendModes = [
  ['position', '定位走势', '位'], ['draw', '开奖走势', '开'], ['route', '012路走势', '路'],
  ['odd', '奇偶走势', '奇'], ['size', '大小走势', '大'], ['zone', '大中小走势', '区'],
  ['sum', '和值走势', '和'], ['tail', '和尾走势', '尾'], ['span', '跨度走势', '跨'],
  ['prime', '质合走势', '质'], ['updown', '升平降走势', '升'], ['max', '最大号走势', '高'],
  ['min', '最小号走势', '低'], ['sequence', '连号走势', '连'], ['amplitude', '振幅走势', '振']
];

const $ = (selector) => document.querySelector(selector);
const digits = (draw) => String(draw.winnum).replace(/\s/g, '').padStart(5, '0').split('').map(Number);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const isPrime = (n) => [1, 2, 3, 5, 7].includes(n);

function metrics(draw, previous) {
  const ds = digits(draw);
  const total = sum(ds);
  const odd = ds.filter((n) => n % 2).length;
  const big = ds.filter((n) => n >= 5).length;
  const routes = [0, 1, 2].map((r) => ds.filter((n) => n % 3 === r).length);
  const prev = previous ? digits(previous) : ds;
  return {
    ds, total, tail: total % 10, span: Math.max(...ds) - Math.min(...ds),
    odd: `${odd}:${5 - odd}`, big: `${big}:${5 - big}`, route: ds.map((n) => n % 3).join(''),
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
  const omit = Array.from({ length: 5 }, () => Array(10).fill(0));
  return draws.map((draw) => {
    const ds = digits(draw);
    const row = omit.map((position, p) => position.map((value, n) => n === ds[p] ? 0 : value + 1));
    for (let p = 0; p < 5; p++) omit[p] = row[p].slice();
    return row;
  });
}

function renderSummary(selected) {
  const latest = selected[selected.length - 1];
  const prev = selected[selected.length - 2];
  if (!latest) return;
  const m = metrics(latest, prev);
  const values = [['期号', latest.issue, latest.kjdate], ['开奖号码', m.ds.join(' '), '直选'], ['和值 / 和尾', `${m.total} / ${m.tail}`, m.total >= 23 ? '大' : '小'], ['跨度', m.span, m.span >= 5 ? '大' : '小'], ['012路', m.route, m.routeCount], ['奇偶 / 大小', m.odd, m.big]];
  $('#summary-strip').innerHTML = values.map(([label, value, sub]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong><em>${sub}</em></div>`).join('');
}

function extraMetrics(draw, previous) {
  const m = metrics(draw, previous);
  const map = {
    position: [m.total, m.span, m.route, m.odd, m.big, m.prime], draw: [m.total, m.tail, m.span, m.odd, m.big, m.routeCount],
    route: [m.route, m.routeCount, m.total % 3, m.tail % 3, m.span % 3, ''], odd: [m.odd, m.ds.map(n => n % 2 ? '奇' : '偶').join(''), m.total % 2 ? '奇' : '偶', m.tail % 2 ? '奇' : '偶', '', ''],
    size: [m.big, m.ds.map(n => n >= 5 ? '大' : '小').join(''), m.total >= 23 ? '大' : '小', m.span >= 5 ? '大' : '小', '', ''],
    zone: [m.zone, m.ds.filter(n => n <= 2).length, m.ds.filter(n => n >= 3 && n <= 6).length, m.ds.filter(n => n >= 7).length, '', ''],
    sum: [m.total, m.total >= 23 ? '大' : '小', m.total % 2 ? '奇' : '偶', m.total % 3, m.tail, ''], tail: [m.tail, m.tail >= 5 ? '大' : '小', m.tail % 2 ? '奇' : '偶', m.tail % 3, '', ''],
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
    route: positional(['0路', '1路', '2路'], (n) => `${n % 3}路`),
    odd: positional(['偶', '奇'], (n) => n % 2 ? '奇' : '偶'),
    size: positional(['小', '大'], (n) => n >= 5 ? '大' : '小'),
    zone: positional(['小', '中', '大'], (n) => n <= 2 ? '小' : n <= 6 ? '中' : '大'),
    prime: positional(['合', '质'], (n) => isPrime(n) ? '质' : '合'),
    updown: positional(['升', '平', '降'], (n, prev) => n > prev ? '升' : n < prev ? '降' : '平'),
    amplitude: positional(Array.from({ length: 10 }, (_, n) => String(n)), (n, prev) => String(Math.abs(n - prev))),
    sum: single('和值', Array.from({ length: 46 }, (_, n) => String(n)), (draw) => String(sum(digits(draw)))),
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
  $('#view-title').textContent = currentMode[1];
  $('#view-subtitle').textContent = `近${state.periods}期 · 分位号码与${currentMode[1].replace('走势', '')}指标`;
  renderSummary(selected);
  if (state.mode !== 'position' && state.mode !== 'draw') {
    renderAnalysisTrend(selected);
    return;
  }
  const omits = calculateOmits(state.draws).slice(-state.periods);
  const labels = { position: ['和值', '跨度', '012', '奇偶', '大小', '质合'], draw: ['和值', '和尾', '跨度', '奇偶', '大小', '路比'] };
  let html = '<div class="chart-row header"><div class="chart-cell fixed">期号</div><div class="chart-cell fixed">日期</div>';
  for (let p = 0; p < 5; p++) for (let n = 0; n < 10; n++) html += `<div class="chart-cell ${n === 9 ? 'group-end' : ''}">${p === 0 ? positionNames[p] : positionNames[p]}<br>${n}</div>`;
  html += (labels[state.mode] || labels.position).map((x) => `<div class="chart-cell metric-cell">${x}</div>`).join('') + '</div>';
  selected.forEach((draw, index) => {
    const ds = digits(draw);
    const rowOmits = omits[index];
    const previous = index ? selected[index - 1] : null;
    html += `<div class="chart-row"><div class="chart-cell fixed">${draw.issue}</div><div class="chart-cell fixed">${String(draw.kjdate).slice(5)}</div>`;
    for (let p = 0; p < 5; p++) for (let n = 0; n < 10; n++) {
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
  for (let p = 0; p < 5; p++) {
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

function generateRecommendation() {
  const count = Number($('#digits-slider').value);
  const windowSize = Number($('#model-window').value);
  const omitWeight = Number($('#omit-weight').value) / 100;
  const freqWeight = Number($('#freq-weight').value) / 100;
  const balance = $('#balance-toggle').checked;
  const sample = state.draws.slice(-windowSize);
  const today = new Date().toISOString().slice(0, 10);
  const random = seededNoise(Number(today.replaceAll('-', '')));
  const picks = [];
  const reasons = [];
  for (let p = 0; p < 5; p++) {
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
  $('#number-picks').innerHTML = picks.map((list, index) => `<div class="pick-column"><h3>${positionNames[index]}</h3><div class="pick-digits">${list.map((n) => `<span class="pick-digit">${n}</span>`).join('')}</div></div>`).join('');
  const bets = count ** 5;
  $('#ticket-code').textContent = picks.map((list) => list.join('')).join('-');
  $('#ticket-bets').textContent = `${bets}注`;
  $('#ticket-cost').textContent = `${bets * 2}元`;
  $('#ticket-probability').textContent = `理论概率 ${(bets / 1000).toFixed(3)}%`;
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

function showView(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `${view}-view`));
  $('.sidebar').style.display = view === 'trend' ? '' : 'none';
  $('.shell').style.gridTemplateColumns = view === 'trend' ? '190px minmax(0, 1fr)' : '1fr';
  $('.toolbar').style.display = view === 'trend' ? '' : 'none';
  $('.summary-strip').style.display = view === 'trend' ? '' : 'none';
  if (view === 'recommend') generateRecommendation();
  if (view === 'history') renderHistory($('#history-search').value.trim());
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
    const response = await fetch(`/api/draws?limit=10000${refresh ? '&refresh=1' : ''}`);
    const result = await response.json();
    state.draws = result.data;
    $('#custom-period').max = state.draws.length;
    $('#custom-period').title = `可输入1至${state.draws.length}期`;
    const latest = state.draws[state.draws.length - 1];
    $('#latest-number').textContent = digits(latest).join(' ');
    $('#latest-issue').textContent = `${latest.issue}期 · ${latest.kjdate}`;
    renderTrend(); generateRecommendation();
    if (refresh) toast('开奖数据已刷新');
  } catch (error) {
    toast('数据加载失败，请稍后重试');
  } finally { $('#refresh-button').disabled = false; }
}

buildMenu();
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
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
window.addEventListener('resize', drawLines);
loadData();
