const { handler, send } = require('../_lib/util');
const db = require('../_lib/db'); const email = require('../_lib/email'); const ai = require('../_lib/ai');
module.exports = handler(async (req, res) => {
  let dbOk = false, dbErr = null;
  if(db.configured()){ try { await db.q('SELECT 1'); dbOk = true; } catch(e){ dbErr = e.message; } }
  // Setup aid when no database is found: the NAMES (never the values) of storage-looking variables and their URL scheme,
  // so "connected a Redis/Blob store" or "connected to Preview only" can be told apart from "nothing connected".
  let storageVars;
  if(!db.configured()) storageVars = Object.keys(process.env).filter(k => /(DATABASE|POSTGRES|PG|NEON|SUPABASE|STORAGE|KV|REDIS|BLOB|EDGE_CONFIG|MONGO|MYSQL)/i.test(k)).sort().slice(0, 40)
    .map(k => k + ':' + ((String(process.env[k]).match(/^([a-z][a-z0-9+]*):\/\//i) || [])[1] || 'value'));
  send(res, 200, { ok: true, db: db.configured(), dbOk, dbErr, env: process.env.VERCEL_ENV || undefined, storageVars, features: {
    accounts: db.configured(), competitions: db.configured(), buddies: db.configured(), sync: db.configured(),
    email: email.configured(), ai: ai.configured(), push: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    whatsapp: !!process.env.TWILIO_AUTH_TOKEN || !!process.env.WHATSAPP_ENABLED } });
}, ['GET']);
