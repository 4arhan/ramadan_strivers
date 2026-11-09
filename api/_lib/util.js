const crypto = require('crypto');
function send(res, status, body, headers){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if(headers) for(const k in headers) res.setHeader(k, headers[k]);
  res.end(JSON.stringify(body));
}
function html(res, status, body, cache){
  res.statusCode = status; res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store'); res.end(body);
}
function cors(req, res){
  // Same-origin web app plus native wrappers (Capacitor: capacitor://localhost, http://localhost).
  const origin = req.headers.origin;
  if(origin){ res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if(req.method === 'OPTIONS'){ res.statusCode = 204; res.end(); return true; }
  return false;
}
async function body(req){
  if(req.body !== undefined && req.body !== null){
    if(typeof req.body === 'string'){ try { return JSON.parse(req.body); } catch(e){ return parseForm(req.body); } }
    return req.body;
  }
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8'); if(!raw) return {};
  const ct = (req.headers['content-type'] || '');
  if(ct.includes('application/x-www-form-urlencoded')) return parseForm(raw);
  try { return JSON.parse(raw); } catch(e){ return parseForm(raw); }
}
function parseForm(raw){ const o = {}; new URLSearchParams(raw).forEach((v, k) => { o[k] = v; }); return o; }
function query(req){
  if(req.query && Object.keys(req.query).length) return req.query;
  const u = new URL(req.url, 'http://x'); const o = {}; u.searchParams.forEach((v, k) => { o[k] = v; }); return o;
}
function origin(req){
  if(process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return proto + '://' + host;
}
function err(status, message, code){ const e = new Error(message); e.status = status; if(code) e.code = code; return e; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function rand(n, alphabet){ const A = alphabet || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const b = crypto.randomBytes(n); for(let i = 0; i < n; i++) s += A[b[i] % A.length]; return s; }
function token(bytes){ return crypto.randomBytes(bytes || 24).toString('base64url'); }
function clampInt(v, lo, hi, dflt){ v = parseInt(v, 10); if(isNaN(v)) return dflt; return Math.max(lo, Math.min(hi, v)); }
function str(v, max){ return String(v == null ? '' : v).trim().slice(0, max); }
// Wrap a handler: CORS, error → JSON, method guard.
function handler(fn, methods){
  return async function(req, res){
    try {
      if(cors(req, res)) return;
      if(methods && !methods.includes(req.method)) return send(res, 405, { error: 'method_not_allowed' });
      await fn(req, res);
    } catch(e){
      const status = e.status || 500;
      if(status >= 500 && status !== 503) console.error(e);
      send(res, status, { error: e.code || (status >= 500 ? 'server_error' : 'bad_request'), message: e.message });
    }
  };
}
module.exports = { send, html, body, query, origin, err, esc, rand, token, clampInt, str, handler };
