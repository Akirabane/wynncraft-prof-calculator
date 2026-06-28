// Calculateur d'XP profession Wynncraft — serveur local (Node natif, zéro dépendance à compiler)
// Utilise node:sqlite (intégré à Node 22+) et un serveur HTTP natif.
const http = require('http');
const fs = require('fs');
const path = require('path');
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n  [ERREUR] Module SQLite indisponible.');
  console.error('  Relance avec :  node --experimental-sqlite server.js');
  console.error('  (ou utilise Lancer.bat qui ajoute le flag automatiquement)\n');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// ---------- Base SQLite (sauvegarde locale) ----------
const db = new DatabaseSync(path.join(__dirname, 'wynn_prof.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL, character_uuid TEXT, character_name TEXT,
    profession TEXT NOT NULL, level INTEGER NOT NULL, xp_percent REAL NOT NULL,
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, profession TEXT NOT NULL,
    target_level INTEGER NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
  '.json':'application/json', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}

async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const r = seg.slice(1);

  // ---- settings ----
  if (r[0] === 'settings' && req.method === 'GET') {
    const rows = db.prepare('SELECT key,value FROM settings').all();
    const out = {}; for (const x of rows) { try { out[x.key] = JSON.parse(x.value); } catch { out[x.key] = x.value; } }
    return sendJSON(res, 200, out);
  }
  if (r[0] === 'settings' && req.method === 'PUT') {
    const body = await readBody(req);
    const stmt = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    for (const [k, v] of Object.entries(body)) stmt.run(k, JSON.stringify(v));
    return sendJSON(res, 200, { ok: true });
  }

  // ---- snapshots ----
  if (r[0] === 'snapshots' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.username || !b.profession || b.level == null) return sendJSON(res, 400, { error: 'champs manquants' });
    const info = db.prepare(`INSERT INTO snapshots(username,character_uuid,character_name,profession,level,xp_percent)
      VALUES(?,?,?,?,?,?)`).run(b.username, b.character_uuid || null, b.character_name || null, b.profession, b.level, b.xp_percent || 0);
    return sendJSON(res, 200, { ok: true, id: Number(info.lastInsertRowid) });
  }
  if (r[0] === 'snapshots' && req.method === 'GET') {
    const u = url.searchParams.get('username'), p = url.searchParams.get('profession');
    let sql = 'SELECT * FROM snapshots WHERE 1=1', args = [];
    if (u) { sql += ' AND username=?'; args.push(u); }
    if (p) { sql += ' AND profession=?'; args.push(p); }
    sql += ' ORDER BY captured_at DESC LIMIT 200';
    return sendJSON(res, 200, db.prepare(sql).all(...args));
  }
  if (r[0] === 'snapshots' && req.method === 'DELETE' && r[1]) {
    db.prepare('DELETE FROM snapshots WHERE id=?').run(r[1]);
    return sendJSON(res, 200, { ok: true });
  }

  // ---- goals ----
  if (r[0] === 'goals' && req.method === 'GET') {
    const u = url.searchParams.get('username');
    const rows = u ? db.prepare('SELECT * FROM goals WHERE username=? ORDER BY created_at DESC').all(u)
                   : db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all();
    return sendJSON(res, 200, rows);
  }
  if (r[0] === 'goals' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.username || !b.profession || !b.target_level) return sendJSON(res, 400, { error: 'champs manquants' });
    const info = db.prepare('INSERT INTO goals(username,profession,target_level,note) VALUES(?,?,?,?)')
      .run(b.username, b.profession, b.target_level, b.note || null);
    return sendJSON(res, 200, { ok: true, id: Number(info.lastInsertRowid) });
  }
  if (r[0] === 'goals' && req.method === 'DELETE' && r[1]) {
    db.prepare('DELETE FROM goals WHERE id=?').run(r[1]);
    return sendJSON(res, 200, { ok: true });
  }

  // ---- proxy API Wynncraft v3 ----
  if (r[0] === 'wynn' && r[1] && req.method === 'GET') {
    const username = encodeURIComponent(decodeURIComponent(r[1]));
    try {
      const resp = await fetch(`https://api.wynncraft.com/v3/player/${username}?fullResult`,
        { headers: { 'User-Agent': 'WynnProfCalc-Local/1.0' } });
      if (resp.status === 404) return sendJSON(res, 404, { error: 'Joueur introuvable' });
      if (resp.status === 300) return sendJSON(res, 300, { error: 'Plusieurs joueurs trouvés, précise le pseudo exact' });
      if (!resp.ok) return sendJSON(res, 502, { error: `API Wynncraft: HTTP ${resp.status}` });
      const data = await resp.json();
      const GATHER = ['woodcutting', 'mining', 'farming', 'fishing'];
      const characters = [];
      for (const [uuid, c] of Object.entries(data.characters || {})) {
        const profs = c.professions || {}, gathering = {};
        for (const g of GATHER) if (profs[g]) gathering[g] = { level: profs[g].level || 0, xpPercent: profs[g].xpPercent || 0 };
        characters.push({ uuid, type: c.type || c.class || '?', nickname: c.nickname || null, level: c.level || 0, gathering });
      }
      return sendJSON(res, 200, { username: data.username || decodeURIComponent(r[1]), uuid: data.uuid, characters });
    } catch (e) {
      return sendJSON(res, 500, { error: 'Erreur réseau: ' + e.message });
    }
  }

  return sendJSON(res, 404, { error: 'route inconnue' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(e => sendJSON(res, 500, { error: e.message }));
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`\n  ⛏️  Calculateur de professions Wynncraft`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
});
