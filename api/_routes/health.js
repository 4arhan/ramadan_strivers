const { handler, send } = require('../_lib/util');
const db = require('../_lib/db'); const email = require('../_lib/email'); const ai = require('../_lib/ai');
module.exports = handler(async (req, res) => {
  let dbOk = false, dbErr = null;
  if(db.configured()){ try { await db.q('SELECT 1'); dbOk = true; } catch(e){ dbErr = e.message; } }
  send(res, 200, { ok: true, db: db.configured(), dbOk, dbErr, features: {
    accounts: db.configured(), competitions: db.configured(), sync: db.configured(),
    email: email.configured(), ai: ai.configured(), push: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    whatsapp: !!process.env.TWILIO_AUTH_TOKEN || !!process.env.WHATSAPP_ENABLED } });
}, ['GET']);
