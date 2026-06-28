import { plan, xpRemaining, resourcesForOneLevel } from './calc.js';

let DATA = null;
let lastFetch = null;

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('fr-FR');

async function init() {
  DATA = await (await fetch('data.json')).json();
  const profSel = $('profSelect');
  for (const [key, p] of Object.entries(DATA.professions)) {
    const o = document.createElement('option');
    o.value = key; o.textContent = p.label;
    profSel.appendChild(o);
  }
  try {
    const s = await (await fetch('/api/settings')).json();
    if (s.username) $('username').value = s.username;
    if (s.profession) profSel.value = s.profession;
    if (s.bonus != null) $('bonus').value = s.bonus;
    if (s.mode) $('mode').value = s.mode;
  } catch {}

  $('fetchBtn').onclick = fetchPlayer;
  $('calcBtn').onclick = runCalc;
  $('saveBtn').onclick = saveSnapshot;
  $('charSelect').onchange = applyCharProf;
  $('profSelect').onchange = () => { applyCharProf(); persistSettings(); };
  $('bonus').onchange = () => { persistSettings(); refreshOverview(); };
  $('mode').onchange = () => { persistSettings(); refreshOverview(); };
  $('filter').oninput = filterTable;
  loadHistory();
}

function persistSettings() {
  fetch('/api/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: $('username').value.trim(),
      profession: $('profSelect').value,
      bonus: +$('bonus').value, mode: $('mode').value
    })
  }).catch(() => {});
}

async function fetchPlayer() {
  const u = $('username').value.trim();
  const msg = $('apiMsg');
  if (!u) { msg.textContent = 'Entre un pseudo.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Chargement...'; msg.className = 'msg';
  try {
    const r = await fetch('/api/wynn/' + encodeURIComponent(u));
    const d = await r.json();
    if (!r.ok) { msg.textContent = d.error || 'Erreur'; msg.className = 'msg error'; return; }
    lastFetch = d;
    const sel = $('charSelect'); sel.innerHTML = '';
    d.characters.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = i;
      const name = c.nickname ? `${c.nickname} (${c.type})` : c.type;
      o.textContent = `${name} -- combat lv${c.level}`;
      sel.appendChild(o);
    });
    $('charPick').classList.toggle('hidden', d.characters.length === 0);
    msg.textContent = `${d.characters.length} personnage(s) charge(s) pour ${d.username}.`;
    msg.className = 'msg ok';
    applyCharProf();
    persistSettings();
  } catch (e) {
    msg.textContent = 'Erreur reseau (le serveur tourne ?).'; msg.className = 'msg error';
  }
}

function applyCharProf() {
  if (!lastFetch) return;
  const c = lastFetch.characters[+$('charSelect').value || 0];
  if (!c) return;
  const profKey = $('profSelect').value;
  const g = c.gathering[profKey];
  if (g) {
    $('curLevel').value = g.level;
    $('curPct').value = (g.xpPercent || 0).toFixed(1);
  }
  renderOverview(c);
}

function refreshOverview() {
  if (!lastFetch) return;
  const c = lastFetch.characters[+$('charSelect').value || 0];
  if (c) renderOverview(c);
}

function renderOverview(c) {
  const order = ['woodcutting', 'mining', 'farming', 'fishing'];
  const bonus = Math.max(0, +$('bonus').value || 0);
  const mode = $('mode').value;
  const selected = $('profSelect').value;
  const name = c.nickname ? `${c.nickname} (${c.type})` : c.type;
  $('overviewTitle').textContent = `Metiers de recolte -- ${name}`;

  $('overviewGrid').innerHTML = order.map(key => {
    const prof = DATA.professions[key];
    const g = c.gathering[key] || { level: 1, xpPercent: 0 };
    const lvl = g.level || 1, pct = g.xpPercent || 0;
    const isMax = lvl >= 132;
    let nextHtml;
    if (isMax) {
      nextHtml = `<div class="pc-next">Niveau max atteint</div>`;
    } else {
      const row = resourcesForOneLevel(DATA, prof, lvl, pct, bonus, mode);
      nextHtml = `<div class="pc-next">Prochain niveau : <b>${fmt(row.count)}</b> ${prof.resourceWord} <span class="res">(${row.resource.name})</span></div>`;
    }
    return `<button class="prof-card ${key === selected ? 'active' : ''} ${isMax ? 'max' : ''}" data-prof="${key}"><div class="pc-head"><span class="pc-name">${prof.label}</span><span class="pc-lvl">Niv ${lvl}</span></div><div class="pc-bar"><i style="width:${Math.min(100, pct)}%"></i></div>${nextHtml}</button>`;
  }).join('');

  $('overview').classList.remove('hidden');
  $('overviewGrid').querySelectorAll('.prof-card').forEach(btn => {
    btn.onclick = () => {
      $('profSelect').value = btn.dataset.prof;
      applyCharProf();
      persistSettings();
      runCalc();
      $('tableWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
}

function runCalc() {
  const profKey = $('profSelect').value;
  const prof = DATA.professions[profKey];
  const from = Math.max(1, Math.min(132, +$('curLevel').value || 1));
  const pct = Math.max(0, Math.min(99.9, +$('curPct').value || 0));
  const to = Math.max(from + 1, Math.min(132, +$('targetLevel').value || 132));
  const bonus = Math.max(0, +$('bonus').value || 0);
  const mode = $('mode').value;

  const result = plan(DATA, prof, from, pct, to, bonus, mode);
  const remXp = xpRemaining(DATA, from, pct, to);
  const nextRow = result.rows[0];

  $('summary').classList.remove('hidden');
  $('summary').innerHTML = `<div class="stat"><div class="k">Profession</div><div class="v green">${prof.label}</div></div><div class="stat"><div class="k">Prochain niveau (${from}-${from + 1})</div><div class="v gold">${nextRow ? fmt(nextRow.count) : '--'}</div><small>${nextRow ? `${prof.resourceWord} -- ${nextRow.resource.name}` : ''}</small></div><div class="stat"><div class="k">Total ${prof.resourceWord} jusqu'au lv ${to}</div><div class="v gold">${fmt(result.totalNodes)}</div></div><div class="stat"><div class="k">XP totale restante</div><div class="v">${fmt(remXp)}</div><small>${bonus ? `bonus +${bonus}% applique` : 'sans bonus'}</small></div>`;

  const tb = $('planTable').querySelector('tbody');
  tb.innerHTML = result.rows.map(r => `<tr data-search="${r.level} ${r.resource.name.toLowerCase()}"><td>${r.level} -> ${r.nextLevel}</td><td><span class="res">${r.resource.name}</span> <small style="color:var(--muted)">(node lv${r.resource.nodeLevel})</small></td><td>${fmt(r.xpPerNode)}</td><td>${fmt(r.xpNeeded)}</td><td><span class="count">${fmt(r.count)}</span> ${prof.resourceWord}</td></tr>`).join('');
  $('tableWrap').classList.remove('hidden');
  $('filter').value = '';
}

function filterTable() {
  const q = $('filter').value.toLowerCase().trim();
  document.querySelectorAll('#planTable tbody tr').forEach(tr => {
    tr.style.display = tr.dataset.search.includes(q) ? '' : 'none';
  });
}

async function saveSnapshot() {
  const msg = $('saveMsg');
  const c = lastFetch ? lastFetch.characters[+$('charSelect').value || 0] : null;
  const body = {
    username: $('username').value.trim() || 'manuel',
    character_uuid: c ? c.uuid : null,
    character_name: c ? (c.nickname || c.type) : null,
    profession: $('profSelect').value,
    level: +$('curLevel').value || 1,
    xp_percent: +$('curPct').value || 0
  };
  try {
    const r = await fetch('/api/snapshots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (r.ok) { msg.textContent = 'sauvegarde'; msg.className = 'msg inline ok'; loadHistory(); }
    else { msg.textContent = 'echec'; msg.className = 'msg inline error'; }
  } catch { msg.textContent = 'serveur injoignable'; msg.className = 'msg inline error'; }
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

async function loadHistory() {
  try {
    const rows = await (await fetch('/api/snapshots')).json();
    if (!rows.length) { $('historyWrap').classList.add('hidden'); return; }
    $('historyWrap').classList.remove('hidden');
    const tb = $('histTable').querySelector('tbody');
    tb.innerHTML = rows.map(r => `<tr><td>${r.captured_at}</td><td>${r.username}</td><td>${r.character_name || '--'}</td><td>${DATA.professions[r.profession]?.label || r.profession}</td><td>${r.level}</td><td>${(r.xp_percent || 0).toFixed(1)}%</td><td><button class="del" data-id="${r.id}">x</button></td></tr>`).join('');
    tb.querySelectorAll('.del').forEach(b => b.onclick = async () => {
      await fetch('/api/snapshots/' + b.dataset.id, { method: 'DELETE' });
      loadHistory();
    });
  } catch {}
}

init();
