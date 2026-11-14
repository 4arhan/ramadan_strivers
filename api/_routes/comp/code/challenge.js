// Head-to-head: one organisation challenges another for a week of Ramadan days. The score is the average points per
// active participant over those days. GET is public; creating and answering need an admin of the right side.
const { handler, send, body, query, err } = require('../../../_lib/util'); const { q, one } = require('../../../_lib/db'); const C = require('../../../_lib/comp');
async function view(ch){ const [a, b, ca, cb] = await Promise.all([C.standing(ch.a_code, ch.start_day, ch.end_day), C.standing(ch.b_code, ch.start_day, ch.end_day), one('SELECT name FROM competitions WHERE code=$1', [ch.a_code]), one('SELECT name FROM competitions WHERE code=$1', [ch.b_code])]);
  return { id: ch.id, status: ch.status, startDay: ch.start_day, endDay: ch.end_day, a: { code: ch.a_code, name: ca ? ca.name : '', avgPts: a.avgPts, active: a.active }, b: { code: ch.b_code, name: cb ? cb.name : '', avgPts: b.avgPts, active: b.active } }; }
module.exports = handler(async (req, res) => {
  const qs = query(req);
  if(req.method === 'GET'){ const c = await C.getComp(qs.code); const rows = (await q('SELECT * FROM challenges WHERE a_code=$1 OR b_code=$1 ORDER BY id DESC LIMIT 20', [c.code])).rows; const out = []; for(const r of rows) out.push(await view(r)); return send(res, 200, { challenges: out }); }
  const { u, c } = await C.access(req, qs.code, 'admin');
  if(req.method === 'DELETE'){ const r = await one('DELETE FROM challenges WHERE id=$1 AND (a_code=$2 OR b_code=$2) RETURNING id', [parseInt(qs.id, 10) || 0, c.code]); if(r) await C.log(u.email, c.code, 'challenge.remove', { id: r.id }); return send(res, 200, { deleted: true }); }
  const b = await body(req);
  if(req.method === 'PATCH'){ const ch = await one('SELECT * FROM challenges WHERE id=$1 AND b_code=$2', [parseInt(b.id, 10) || 0, c.code]); if(!ch) throw err(404, 'Challenge not found', 'not_found');
    const r = await one('UPDATE challenges SET status=$2 WHERE id=$1 RETURNING *', [ch.id, b.accept ? 'active' : 'declined']); await C.log(u.email, c.code, b.accept ? 'challenge.accept' : 'challenge.decline', { id: ch.id }); return send(res, 200, { challenge: await view(r) }); }
  const other = await C.getComp(b.other); if(other.code === c.code) throw err(400, 'Choose another organisation', 'same');
  const start = Math.max(1, Math.min(30, parseInt(b.startDay, 10) || 1)), end = Math.min(30, start + 6);
  const n = await one('SELECT count(*) AS n FROM challenges WHERE (a_code=$1 OR b_code=$1) AND status IN (\'pending\',\'active\')', [c.code]); if(parseInt(n.n, 10) >= 5) throw err(429, 'Too many open challenges', 'full');
  const r = await one('INSERT INTO challenges(a_code,b_code,start_day,end_day) VALUES($1,$2,$3,$4) RETURNING *', [c.code, other.code, start, end]);
  await C.log(u.email, c.code, 'challenge.send', { other: other.code, start, end });
  send(res, 201, { challenge: await view(r) });
}, ['GET', 'POST', 'PATCH', 'DELETE']);
