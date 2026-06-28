import { plan, xpRemaining, resourcesForOneLevel } from './calc.js';

let DATA = null;
let lastFetch = null;

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('fr-FR');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* — Profession line icons (Lucide-style, currentColor) — */
const ICONS = {
  woodcutting: '<path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9"/><path d="M15 13 9 7l4-4 6 6h3a8 8 0 0 1-7 7z"/>',
  mining: '<path d="M14.5 12.5 6.6 20.4a1 1 0 1 1-3-3l7.9-7.9"/><path d="M15.7 4.3a12.5 12.5 0 0 0-10.2-1.3 1 1 0 0 0 .1 1.7 22 22 0 0 1 6.3 3.4"/><path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="M19.7 8.3a12.5 12.5 0 0 1 1.3 10.2 1 1 0 0 1-1.7-.1 22 22 0 0 0-3.4-6.3"/>',
  farming: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  fishing: '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.9a9.8 9.8 0 0 1 0-11.9"/><path d="M7 10.7C7 8 5.6 6 2.7 5.5c-1 1.5-1 5 .3 6.5-1.3 1.5-1.3 5 0 6.5C5.6 18 7 16 7 13.3"/>'
};
const svgIcon = (key) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[key] || ''}</svg>`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* — Animated count-up (respects reduced motion) — */
function countTo(el, value) {
  if (REDUCED) { el.textContent = fmt(value); return; }
  const start = performance.now();
  const dur = 650;
  const from = 0;
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);          // ease-out-cubic
    el.textContent = fmt(Math.round(from + (value - from) * eased));
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = fmt(value);
  }
  requestAnimationFrame(frame);
}

/* — Animate every tile progress bar from 0 to its target width — */
function animateTracks(root) {
  root.querySelectorAll('.tile__track span').forEach((bar) => {
    const w = bar.dataset.w || '0';
    if (REDUCED) { bar.style.width = w + '%'; return; }
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = w + '%'; }));
  });
}

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
  $('username').addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchPlayer(); });
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

function setMsg(el, text, state) {
  el.textContent = text;
  el.className = 'msg' + (el.classList.contains('msg--inline') || el.id === 'saveMsg' ? ' msg--inline' : '') + (state ? ' ' + state : '');
}

async function fetchPlayer() {
  const u = $('username').value.trim();
  const msg = $('apiMsg');
  const btn = $('fetchBtn');
  if (!u) { setMsg(msg, 'Entre un pseudo Wynncraft.', 'is-error'); return; }

  btn.classList.add('is-loading');
  setMsg(msg, 'Connexion à l’API Wynncraft…', 'is-info');
  try {
    const r = await fetch('/api/wynn/' + encodeURIComponent(u));
    const d = await r.json();
    if (!r.ok) { setMsg(msg, d.error || 'Joueur introuvable.', 'is-error'); return; }
    lastFetch = d;

    const sel = $('charSelect'); sel.innerHTML = '';
    d.characters.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = i;
      const name = c.nickname ? `${c.nickname} (${c.type})` : c.type;
      o.textContent = `${name} — combat lv${c.level}`;
      sel.appendChild(o);
    });
    $('charPick').classList.toggle('hidden', d.characters.length === 0);

    const n = d.characters.length;
    setMsg(msg, `${n} personnage${n > 1 ? 's' : ''} chargé${n > 1 ? 's' : ''} pour ${d.username}.`, 'is-ok');
    applyCharProf();
    persistSettings();
  } catch (e) {
    setMsg(msg, 'Erreur réseau. Réessaie dans un instant.', 'is-error');
  } finally {
    btn.classList.remove('is-loading');
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
  $('overviewTitle').textContent = `Métiers de récolte — ${name}`;

  $('overviewGrid').innerHTML = order.map((key) => {
    const prof = DATA.professions[key];
    const g = c.gathering[key] || { level: 1, xpPercent: 0 };
    const lvl = g.level || 1, pct = Math.min(100, g.xpPercent || 0);
    const isMax = lvl >= 132;
    let next;
    if (isMax) {
      next = `<span class="tile__next">Niveau max atteint</span>`;
    } else {
      const row = resourcesForOneLevel(DATA, prof, lvl, pct, bonus, mode);
      next = `<span class="tile__next">Prochain : <b>${fmt(row.count)}</b> <em>${prof.resourceWord}</em> · ${esc(row.resource.name)}</span>`;
    }
    return `<button type="button" class="tile ${key === selected ? 'is-active' : ''} ${isMax ? 'is-max' : ''}" data-prof="${key}">
      <span class="tile__top">
        <span class="tile__icon">${svgIcon(key)}</span>
        <span class="tile__lvl">${lvl}<small> NIV</small></span>
      </span>
      <span class="tile__name">${prof.label}</span>
      <span class="tile__track"><span data-w="${pct}"></span></span>
      ${next}
    </button>`;
  }).join('');

  $('overview').classList.remove('hidden');
  const grid = $('overviewGrid');
  animateTracks(grid);
  grid.querySelectorAll('.tile').forEach((btn) => {
    btn.onclick = () => {
      $('profSelect').value = btn.dataset.prof;
      applyCharProf();
      persistSettings();
      runCalc();
      $('summary').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
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
  $('summary').innerHTML = `
    <div class="metric is-hero">
      <span class="metric__label">Total ${esc(prof.resourceWord)} jusqu'au niveau ${to}</span>
      <span class="metric__value is-accent" data-count="${result.totalNodes}">0</span>
      <span class="metric__sub">${esc(prof.label)}${bonus ? ` · bonus +${bonus}%` : ''}</span>
    </div>
    <div class="metric">
      <span class="metric__label">Prochain niveau (${from} → ${from + 1})</span>
      <span class="metric__value" data-count="${nextRow ? nextRow.count : 0}">0</span>
      <span class="metric__sub">${nextRow ? `${esc(prof.resourceWord)} · ${esc(nextRow.resource.name)}` : '—'}</span>
    </div>
    <div class="metric">
      <span class="metric__label">XP totale restante</span>
      <span class="metric__value" data-count="${remXp}">0</span>
      <span class="metric__sub">${bonus ? `bonus +${bonus}% appliqué` : 'sans bonus'}</span>
    </div>
    <div class="metric">
      <span class="metric__label">Paliers à monter</span>
      <span class="metric__value" data-count="${to - from}">0</span>
      <span class="metric__sub">du niveau ${from} au ${to}</span>
    </div>`;

  $('summary').querySelectorAll('[data-count]').forEach((el) => countTo(el, +el.dataset.count));

  const tb = $('planTable').querySelector('tbody');
  tb.innerHTML = result.rows.map((r) => `<tr data-search="${r.level} ${esc(r.resource.name.toLowerCase())}">
    <td>${r.level} → ${r.nextLevel}</td>
    <td><span class="res-name">${esc(r.resource.name)}</span> <span class="node-tag">node lv${r.resource.nodeLevel}</span></td>
    <td class="num">${fmt(r.xpPerNode)}</td>
    <td class="num">${fmt(r.xpNeeded)}</td>
    <td class="num"><span class="count-pill">${fmt(r.count)}</span></td>
  </tr>`).join('');
  $('tableWrap').classList.remove('hidden');
  $('filter').value = '';
}

function filterTable() {
  const q = $('filter').value.toLowerCase().trim();
  document.querySelectorAll('#planTable tbody tr').forEach((tr) => {
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
    if (r.ok) { setMsg(msg, 'Point sauvegardé ✓', 'is-ok'); loadHistory(); }
    else { setMsg(msg, 'Échec de la sauvegarde.', 'is-error'); }
  } catch { setMsg(msg, 'Serveur injoignable.', 'is-error'); }
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

async function loadHistory() {
  try {
    const rows = await (await fetch('/api/snapshots')).json();
    if (!rows.length) { $('historyWrap').classList.add('hidden'); return; }
    $('historyWrap').classList.remove('hidden');
    const tb = $('histTable').querySelector('tbody');
    tb.innerHTML = rows.map((r) => `<tr>
      <td>${esc(r.captured_at)}</td>
      <td>${esc(r.username)}</td>
      <td>${esc(r.character_name || '—')}</td>
      <td>${esc(DATA.professions[r.profession]?.label || r.profession)}</td>
      <td class="num">${r.level}</td>
      <td class="num">${(r.xp_percent || 0).toFixed(1)}%</td>
      <td class="num"><button class="del" data-id="${r.id}" aria-label="Supprimer ce point" title="Supprimer">✕</button></td>
    </tr>`).join('');
    tb.querySelectorAll('.del').forEach((b) => b.onclick = async () => {
      await fetch('/api/snapshots/' + b.dataset.id, { method: 'DELETE' });
      loadHistory();
    });
  } catch {}
}

init();
