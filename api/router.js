// Single Node function that serves every /api/* route (Vercel Hobby allows at most 12 functions per
// deployment). vercel.json rewrites /api/<path> here as /api/router?__p=<path>; files in api/_routes and
// api/_lib are plain modules, not functions. The share image (api/_routes/og.js) renders here too.
const ROUTES = [
  ['health', () => require('./_routes/health')],
  ['sync', () => require('./_routes/sync')],
  ['share', () => require('./_routes/share')],
  ['og', () => require('./_routes/og')],
  ['whatsapp', () => require('./_routes/whatsapp')],
  ['auth/register', () => require('./_routes/auth/register')],
  ['auth/login', () => require('./_routes/auth/login')],
  ['auth/magic', () => require('./_routes/auth/magic')],
  ['auth/me', () => require('./_routes/auth/me')],
  ['push/key', () => require('./_routes/push/key')],
  ['push/subscribe', () => require('./_routes/push/subscribe')],
  ['cron/daily', () => require('./_routes/cron/daily')],
  ['ai/explain', () => require('./_routes/ai/explain')],
  ['ai/reflect', () => require('./_routes/ai/reflect')],
  ['ai/quiz', () => require('./_routes/ai/quiz')],
  ['comp', () => require('./_routes/comp/index')],
  ['comp/:code', () => require('./_routes/comp/item')],
  ['comp/:code/join', () => require('./_routes/comp/code/join')],
  ['comp/:code/score', () => require('./_routes/comp/code/score')],
  ['comp/:code/board', () => require('./_routes/comp/code/board')],
  ['comp/:code/participants', () => require('./_routes/comp/code/participants')],
  ['comp/:code/enrol', () => require('./_routes/comp/code/enrol')],
  ['comp/:code/export', () => require('./_routes/comp/code/export')],
  ['comp/:code/poster', () => require('./_routes/comp/code/poster')],
  ['comp/:code/certs', () => require('./_routes/comp/code/certs')],
].map(([pattern, load]) => ({ parts: pattern.split('/'), load }));

function match(path){
  const segs = path.split('/').filter(Boolean);
  for(const r of ROUTES){
    if(r.parts.length !== segs.length) continue;
    const params = {}; let ok = true;
    for(let i = 0; i < segs.length; i++){
      const p = r.parts[i];
      if(p[0] === ':') params[p.slice(1)] = decodeURIComponent(segs[i]);
      else if(p !== segs[i]){ ok = false; break; }
    }
    if(ok) return { route: r, params };
  }
  return null;
}

module.exports = async function router(req, res){
  const u = new URL(req.url, 'http://x');
  // Prefer the explicit rewrite parameter; fall back to the URL path for direct calls.
  let path = u.searchParams.get('__p');
  if(path == null) path = u.pathname.replace(/^\/api\/?/, '').replace(/^router\/?/, '');
  const m = match(String(path).replace(/^\/+|\/+$/g, ''));
  if(!m){ res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'not_found', path })); }
  const q = {}; u.searchParams.forEach((v, k) => { if(k !== '__p') q[k] = v; });
  req.query = Object.assign(q, m.params);
  const mod = m.route.load(); const h = mod.default || mod;
  return h(req, res);
};
module.exports.match = match;
