// Super admin: create and manage leagues, approve organisations and set their division.
const { handler, send, body, query, str, err } = require('../../_lib/util'); const { q, one } = require('../../_lib/db'); const C = require('../../_lib/comp'); const L = require('../../_lib/league'); const { superUser } = require('./index');
module.exports = handler(async (req, res) => {
  const u = await superUser(req); const qs = query(req);
  if(req.method === 'GET'){ const leagues = (await q('SELECT * FROM leagues ORDER BY name', [])).rows;
    const members = (await q('SELECT m.league_id,m.comp_code,m.division,m.status,m.joined_at,c.name,c.type,(SELECT count(*) FROM participants p WHERE p.comp_code=c.code AND p.claimed) AS participants FROM league_members m JOIN competitions c ON c.code=m.comp_code ORDER BY m.joined_at', [])).rows;
    return send(res, 200, { divisions: L.DIVISIONS, leagues: leagues.map(l => ({ id: l.id, slug: l.slug, name: l.name, country: l.country, about: l.about, open: l.open,
      members: members.filter(m => m.league_id === l.id).map(m => ({ code: m.comp_code, name: m.name, type: m.type, division: m.division, status: m.status, participants: parseInt(m.participants, 10) || 0 })) })) }); }
  if(req.method === 'DELETE'){ const l = await L.bySlug(qs.slug); if(!l) throw err(404, 'League not found');
    if(qs.code){ await q('DELETE FROM league_members WHERE league_id=$1 AND comp_code=$2', [l.id, String(qs.code).toUpperCase()]); await C.log(u.email, String(qs.code).toUpperCase(), 'league.removeMember', { league: l.slug }); }
    else { await q('DELETE FROM leagues WHERE id=$1', [l.id]); await C.log(u.email, null, 'league.delete', { league: l.slug }); }
    return send(res, 200, { deleted: true }); }
  const b = await body(req);
  if(req.method === 'POST'){ const name = str(b.name, 80), slug = L.slugify(b.slug || b.name); if(!name || slug.length < 3) throw err(400, 'A league needs a name', 'name_required');
    if(await L.bySlug(slug)) throw err(409, 'A league with this address already exists', 'exists');
    const l = await one('INSERT INTO leagues(slug,name,country,about) VALUES($1,$2,$3,$4) RETURNING *', [slug, name, str(b.country, 60), str(b.about, 300)]); await C.log(u.email, null, 'league.create', { league: slug });
    return send(res, 201, { league: { slug: l.slug, name: l.name } }); }
  const l = await L.bySlug(b.slug); if(!l) throw err(404, 'League not found');
  if(b.code){ const status = ['approved', 'pending', 'rejected'].includes(b.status) ? b.status : null, division = b.division !== undefined ? str(b.division, 40) : null;
    const m = await one('UPDATE league_members SET status=COALESCE($3,status), division=COALESCE($4,division) WHERE league_id=$1 AND comp_code=$2 RETURNING status,division', [l.id, String(b.code).toUpperCase(), status, division]); if(!m) throw err(404, 'Not a member');
    await C.log(u.email, String(b.code).toUpperCase(), 'league.member', { league: l.slug, status: m.status, division: m.division }); return send(res, 200, m); }
  const nl = await one('UPDATE leagues SET name=$2, country=$3, about=$4, open=$5 WHERE id=$1 RETURNING *', [l.id, b.name !== undefined ? (str(b.name, 80) || l.name) : l.name, b.country !== undefined ? str(b.country, 60) : l.country, b.about !== undefined ? str(b.about, 300) : l.about, typeof b.open === 'boolean' ? b.open : l.open]);
  send(res, 200, { league: { slug: nl.slug, name: nl.name, open: nl.open } });
}, ['GET', 'POST', 'PATCH', 'DELETE']);
