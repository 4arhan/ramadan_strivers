// Super admin extras. ?what=notices: GET (any signed-in organiser reads the latest), POST {text}, DELETE ?id.
// ?what=flags: GET (public: the feature switches), PUT {key, on}. ?what=audit: GET the latest log entries.
const { handler, send, body, query, str, err } = require('../../_lib/util'); const { q, one } = require('../../_lib/db'); const A = require('../../_lib/auth'); const C = require('../../_lib/comp'); const { superUser } = require('./index');
const FLAGS = ['leagues', 'signups', 'checkin', 'stories', 'ask', 'storyImages'];
module.exports = handler(async (req, res) => {
  const qs = query(req), what = qs.what;
  if(what === 'flags'){
    if(req.method === 'GET'){ const rows = (await q('SELECT key,value FROM flags', [])).rows; const out = {}; FLAGS.forEach(k => { out[k] = true; }); rows.forEach(r => { if(FLAGS.includes(r.key)) out[r.key] = r.value !== false; }); return send(res, 200, { flags: out }, { 'Cache-Control': 'public, max-age=60' }); }
    const u = await superUser(req); const b = await body(req); if(!FLAGS.includes(b.key)) throw err(400, 'Unknown switch');
    await q('INSERT INTO flags(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [b.key, JSON.stringify(!!b.on)]); await C.log(u.email, null, 'flag.set', { key: b.key, on: !!b.on }); return send(res, 200, { key: b.key, on: !!b.on }); }
  if(what === 'notices'){
    if(req.method === 'GET'){ await A.requireUser(req); const rows = (await q('SELECT id,text,created_at FROM notices ORDER BY id DESC LIMIT 5', [])).rows; return send(res, 200, { notices: rows }); }
    const u = await superUser(req);
    if(req.method === 'DELETE'){ await q('DELETE FROM notices WHERE id=$1', [parseInt(qs.id, 10) || 0]); return send(res, 200, { deleted: true }); }
    const b = await body(req); const text = str(b.text, 500); if(!text) throw err(400, 'Text required');
    const r = await one('INSERT INTO notices(text) VALUES($1) RETURNING id,text,created_at', [text]); await C.log(u.email, null, 'notice.post', { id: r.id });
    // also by email when the server can send it
    let emailed = 0; const mail = require('../../_lib/email');
    if(mail.configured() && b.email){ const owners = (await q('SELECT DISTINCT u.email FROM competitions c JOIN users u ON u.id=c.owner_id WHERE u.email IS NOT NULL LIMIT 2000', [])).rows;
      for(const o of owners){ try { await mail.sendEmail({ to: o.email, subject: 'Ramadan Strivers: a note for organisers', html: mail.layout('A note for organisers', '<p>' + text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])) + '</p>') }); emailed++; } catch(e){ /* keep going */ } } }
    return send(res, 201, { notice: r, emailed }); }
  if(what === 'audit'){ await superUser(req); const rows = (await q('SELECT at,email,comp_code,action,detail FROM audit ORDER BY id DESC LIMIT 200', [])).rows; return send(res, 200, { log: rows }); }
  throw err(404, 'Not found');
}, ['GET', 'POST', 'PUT', 'DELETE']);
module.exports.FLAGS = FLAGS;
