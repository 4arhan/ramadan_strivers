const crypto = require('crypto');
const { one, q } = require('./db');
const { err } = require('./util');
function secret(){
  const s = process.env.AUTH_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if(!s) throw err(503, 'AUTH_SECRET not configured', 'auth_not_configured');
  return crypto.createHash('sha256').update('rs-auth:' + s).digest();
}
function hashPassword(pw){ const salt = crypto.randomBytes(16); const key = crypto.scryptSync(pw, salt, 32); return 's1$' + salt.toString('base64url') + '$' + key.toString('base64url'); }
function verifyPassword(pw, stored){
  if(!stored || !stored.startsWith('s1$')) return false;
  const [, salt, key] = stored.split('$'); const k2 = crypto.scryptSync(pw, Buffer.from(salt, 'base64url'), 32);
  return crypto.timingSafeEqual(Buffer.from(key, 'base64url'), k2);
}
function b64(o){ return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function sign(payload, ttlSec){
  const p = Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + (ttlSec || 60 * 60 * 24 * 90) });
  const data = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(p);
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return data + '.' + sig;
}
function verify(tok){
  if(!tok || typeof tok !== 'string') return null;
  const parts = tok.split('.'); if(parts.length !== 3) return null;
  const sig = crypto.createHmac('sha256', secret()).update(parts[0] + '.' + parts[1]).digest('base64url');
  if(sig.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[2]))) return null;
  try { const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); if(p.exp && p.exp < Date.now() / 1000) return null; return p; } catch(e){ return null; }
}
function bearer(req){
  const h = req.headers.authorization || '';
  if(h.startsWith('Bearer ')) return h.slice(7).trim();
  const u = new URL(req.url, 'http://x'); return u.searchParams.get('auth') || null;
}
async function optionalUser(req){
  const p = verify(bearer(req)); if(!p || !p.uid) return null;
  const u = await one('SELECT id,email,name,settings,created_at FROM users WHERE id=$1', [p.uid]);
  if(u) q('UPDATE users SET last_seen=now() WHERE id=$1', [u.id]).catch(() => {});
  return u;
}
async function requireUser(req){ const u = await optionalUser(req); if(!u) throw err(401, 'Sign in required', 'unauthorized'); return u; }
function publicUser(u){ return { id: u.id, email: u.email, name: u.name, settings: u.settings || {} }; }
module.exports = { hashPassword, verifyPassword, sign, verify, bearer, optionalUser, requireUser, publicUser };
