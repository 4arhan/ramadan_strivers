// Leagues an organisation can join. GET: the open leagues (with ?code=, this competition's membership in each).
// POST {slug, code}: an admin of the competition asks to join (the super admin approves). DELETE ?slug=&code=: leave.
const { handler, send, body, query, err } = require('../../_lib/util'); const { q, one } = require('../../_lib/db'); const C = require('../../_lib/comp'); const L = require('../../_lib/league');
module.exports = handler(async (req, res) => {
  const qs = query(req);
  if(req.method === 'GET'){ const code = String(qs.code || '').toUpperCase();
    const rows = (await q('SELECT l.*, (SELECT count(*) FROM league_members m WHERE m.league_id=l.id AND m.status=\'approved\') AS n FROM leagues l WHERE l.open ORDER BY l.name', [])).rows;
    const mine = code ? (await q('SELECT league_id,division,status FROM league_members WHERE comp_code=$1', [code])).rows : [];
    return send(res, 200, { divisions: L.DIVISIONS, leagues: rows.map(l => { const m = mine.find(x => x.league_id === l.id); return { slug: l.slug, name: l.name, country: l.country, about: l.about, organisations: parseInt(l.n, 10), status: m ? m.status : null, division: m ? m.division : null }; }) }); }
  const b = req.method === 'DELETE' ? qs : await body(req); const { u, c } = await C.access(req, b.code, 'admin'); const l = await L.bySlug(b.slug); if(!l) throw err(404, 'League not found', 'not_found');
  if(req.method === 'DELETE'){ await q('DELETE FROM league_members WHERE league_id=$1 AND comp_code=$2', [l.id, c.code]); await C.log(u.email, c.code, 'league.leave', { league: l.slug }); return send(res, 200, { left: true }); }
  if(!l.open) throw err(403, 'This league is not taking new organisations', 'closed');
  const division = L.DIVISIONS.includes(b.division) ? b.division : L.defaultDivision(c.type);
  const m = await one('INSERT INTO league_members(league_id,comp_code,division) VALUES($1,$2,$3) ON CONFLICT (league_id,comp_code) DO UPDATE SET division=EXCLUDED.division RETURNING status,division', [l.id, c.code, division]);
  await C.log(u.email, c.code, 'league.request', { league: l.slug, division });
  send(res, 201, { status: m.status, division: m.division });
}, ['GET', 'POST', 'DELETE']);
