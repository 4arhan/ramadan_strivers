// GET: what a buddy sees (name, summary, last update). With the owner's token (?t=) also the encouragements received.
// PUT (owner): refresh the summary, rename, or acknowledge the encouragements. DELETE (owner): stop sharing.
const { handler, send, body, query, str } = require('../../_lib/util'); const { one, q } = require('../../_lib/db'); const B = require('../../_lib/buddy');
module.exports = handler(async (req, res) => {
  const qs = query(req); const row = await B.get(qs.code);
  if(req.method === 'GET'){
    const out = B.pub(row); if(qs.t && String(qs.t) === row.token) out.nudges = row.nudges || [];
    return send(res, 200, out);
  }
  const b = await body(req); if(String(b.token || '') !== row.token) throw B.err(403, 'Only the owner can do this', 'forbidden');
  if(req.method === 'DELETE'){ await q('DELETE FROM buddies WHERE code=$1', [row.code]); return send(res, 200, { deleted: true }); }
  const name = b.name !== undefined ? (str(b.name, 24) || row.name) : row.name;
  const summary = b.summary !== undefined ? B.cleanSummary(b.summary) : row.summary;
  const nudges = b.ack ? [] : (row.nudges || []);
  const np = await one('UPDATE buddies SET name=$2, summary=$3, nudges=$4, updated_at=now() WHERE code=$1 RETURNING *', [row.code, name, JSON.stringify(summary), JSON.stringify(nudges)]);
  send(res, 200, Object.assign(B.pub(np), { nudges: np.nudges || [] }));
}, ['GET', 'PUT', 'DELETE']);
