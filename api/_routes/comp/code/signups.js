// Iftar and volunteer sign-up: the organiser lists what is needed ("Dates for Friday iftar", 5 places); participants
// put their display name down. GET is public (names only); joining needs a participant token.
const { handler, send, body, query, str, err } = require('../../../_lib/util'); const { q, one } = require('../../../_lib/db'); const C = require('../../../_lib/comp');
const pub = r => ({ id: r.id, title: r.title, day: r.day, slots: r.slots, taken: (r.taken || []).map(x => ({ name: x.name, pid: x.pid })) });
module.exports = handler(async (req, res) => {
  const qs = query(req);
  if(req.method === 'GET'){ const c = await C.getComp(qs.code); const rows = (await q('SELECT * FROM signups WHERE comp_code=$1 ORDER BY id', [c.code])).rows; return send(res, 200, { signups: rows.map(pub) }); }
  if(req.method === 'PATCH'){ const c = await C.getComp(qs.code); const b = await body(req);
    const p = await one('SELECT id,name FROM participants WHERE comp_code=$1 AND token=$2', [c.code, String(b.token || '')]); if(!p) throw err(404, 'Join the competition first', 'not_found');
    const s = await one('SELECT * FROM signups WHERE id=$1 AND comp_code=$2', [parseInt(b.id, 10) || 0, c.code]); if(!s) throw err(404, 'Not found', 'not_found');
    let taken = (s.taken || []).filter(x => x.pid !== p.id);
    if(b.action !== 'leave'){ if(taken.length >= s.slots) throw err(409, 'All places are taken', 'full'); taken.push({ pid: p.id, name: p.name }); }
    const r = await one('UPDATE signups SET taken=$2 WHERE id=$1 RETURNING *', [s.id, JSON.stringify(taken)]); return send(res, 200, { signup: pub(r) }); }
  const { u, c } = await C.access(req, qs.code, 'admin');
  if(req.method === 'DELETE'){ await q('DELETE FROM signups WHERE id=$1 AND comp_code=$2', [parseInt(qs.id, 10) || 0, c.code]); return send(res, 200, { deleted: true }); }
  const b = await body(req); const title = str(b.title, 80); if(!title) throw err(400, 'Title required');
  const n = await one('SELECT count(*) AS n FROM signups WHERE comp_code=$1', [c.code]); if(parseInt(n.n, 10) >= 60) throw err(429, 'Too many sign-up items', 'full');
  const r = await one('INSERT INTO signups(comp_code,title,day,slots) VALUES($1,$2,$3,$4) RETURNING *', [c.code, title, str(b.day, 40), Math.max(1, Math.min(200, parseInt(b.slots, 10) || 1))]);
  await C.log(u.email, c.code, 'signup.add', { title });
  send(res, 201, { signup: pub(r) });
}, ['GET', 'POST', 'PATCH', 'DELETE']);
