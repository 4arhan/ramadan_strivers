// Cloud sync of the whole local state. GET returns the server snapshot; PUT merges the client's snapshot in and returns the merged result.
const { handler, send, body, err } = require('../_lib/util');
const { one, q } = require('../_lib/db'); const A = require('../_lib/auth'); const { mergeSnapshots } = require('../_lib/merge');
module.exports = handler(async (req, res) => {
  const u = await A.requireUser(req);
  const row = await one('SELECT data, updated_at FROM sync_data WHERE user_id=$1', [u.id]);
  if(req.method === 'GET') return send(res, 200, { data: row ? row.data : null, updated_at: row ? row.updated_at : null });
  const b = await body(req); if(!b || typeof b.data !== 'object') throw err(400, 'data object required');
  if(JSON.stringify(b.data).length > 400000) throw err(413, 'Snapshot too large');
  const merged = mergeSnapshots(row ? row.data : null, b.data);
  await q('INSERT INTO sync_data(user_id,data,updated_at) VALUES($1,$2,now()) ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()', [u.id, JSON.stringify(merged)]);
  send(res, 200, { data: merged, updated_at: new Date().toISOString() });
}, ['GET', 'PUT']);
