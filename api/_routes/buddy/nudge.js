// A buddy sends one preset encouragement. Kinds are fixed (the app shows its own translated text for each), the sender
// name is trimmed, at most 20 are kept, and the same sender cannot repeat the same kind within an hour.
const { handler, send, body, query, str } = require('../../_lib/util'); const { q } = require('../../_lib/db'); const B = require('../../_lib/buddy');
module.exports = handler(async (req, res) => {
  const row = await B.get(query(req).code); const b = await body(req);
  const kind = String(b.kind || ''); if(B.KINDS.indexOf(kind) < 0) throw B.err(400, 'Unknown encouragement', 'bad_kind');
  const from = str(b.from, 24); if(!from) throw B.err(400, 'Enter a display name', 'name_required');
  const now = Date.now(); const list = (row.nudges || []).filter(n => n && typeof n === 'object');
  if(list.some(n => n.from === from && n.k === kind && now - Number(n.at) < 3600e3)) return send(res, 200, { ok: true, repeated: true });
  list.push({ k: kind, from, at: now });
  await q('UPDATE buddies SET nudges=$2 WHERE code=$1', [row.code, JSON.stringify(list.slice(-20))]);
  send(res, 201, { ok: true });
}, ['POST']);
