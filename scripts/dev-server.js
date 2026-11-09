// Minimal local stand-in for Vercel: serves static files and routes /api/* to the handler files (supports [param] segments).
// Usage: DATABASE_URL=postgres://... node scripts/dev-server.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const PORT = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.ico': 'image/x-icon', '.txt': 'text/plain' };
// Mirrors vercel.json: every /api/* path except og and router goes to the single router function.
const REWRITES = [[/^\/s\/([^/?]+)/, (m) => '/api/router?__p=share&id=' + m[1]], [/^\/poster\/([^/?]+)/, (m) => '/api/router?__p=comp/' + m[1] + '/poster'], [/^\/join\/([^/?]+)/, (m) => '/?join=' + m[1]],
  [/^\/api\/(?!router(?:[/?]|$))([^?]*)(\?.*)?$/, (m) => '/api/router?__p=' + m[1] + (m[2] ? '&' + m[2].slice(1) : '')]];
function resolveApi(pathname){
  const segs = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean); const params = {};
  let dir = path.join(ROOT, 'api');
  for(let i = 0; i < segs.length; i++){ const last = i === segs.length - 1; const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    if(last){ if(entries.includes(segs[i] + '.js')) return { file: path.join(dir, segs[i] + '.js'), params }; if(entries.includes(segs[i]) && fs.existsSync(path.join(dir, segs[i], 'index.js'))) return { file: path.join(dir, segs[i], 'index.js'), params };
      const dyn = entries.find(e => /^\[.+\]\.js$/.test(e)); if(dyn){ params[dyn.slice(1, -4)] = decodeURIComponent(segs[i]); return { file: path.join(dir, dyn), params }; } return null; }
    if(entries.includes(segs[i])) { dir = path.join(dir, segs[i]); continue; }
    const dynDir = entries.find(e => /^\[.+\]$/.test(e) && fs.statSync(path.join(dir, e)).isDirectory()); if(dynDir){ params[dynDir.slice(1, -1)] = decodeURIComponent(segs[i]); dir = path.join(dir, dynDir); continue; }
    return null; }
  if(fs.existsSync(path.join(dir, 'index.js'))) return { file: path.join(dir, 'index.js'), params }; return null;
}
const server = http.createServer(async (req, res) => {
  let url = req.url; for(const [re, fn] of REWRITES){ const m = url.match(re); if(m){ const base = fn(m); url = base + (url.includes('?') && !base.includes('?') ? url.slice(url.indexOf('?')) : (url.includes('?') && base.includes('?') && !/^\/api\//.test(url) ? '&' + url.slice(url.indexOf('?') + 1) : '')); break; } }
  const u = new URL(url, 'http://localhost');
  if(u.pathname.startsWith('/api/')){ const r = resolveApi(u.pathname); if(!r){ res.statusCode = 404; return res.end('{"error":"not_found"}'); }
    if(process.env.DEV_RELOAD) delete require.cache[require.resolve(r.file)];
    const mod = require(r.file); const h = mod.default || mod; req.url = url; req.query = Object.assign({}, r.params); u.searchParams.forEach((v, k) => { req.query[k] = v; });
    if(typeof h !== 'function'){ res.statusCode = 500; return res.end('{"error":"bad_handler"}'); }
    return h(req, res); }
  let p = decodeURIComponent(u.pathname); if(p === '/') p = '/index.html'; const f = path.join(ROOT, p); if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
});
server.listen(PORT, () => console.log('dev server on http://localhost:' + PORT));
