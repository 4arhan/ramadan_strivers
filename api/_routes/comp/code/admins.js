// The people who help run a competition (owner only): admin, teacher (one class or team) or viewer, added by email.
// They sign in with an account that has that email; an invitation can be added before the account exists.
const { handler, send, body, query, str, err } = require('../../../_lib/util'); const { q, one } = require('../../../_lib/db'); const C = require('../../../_lib/comp');
const ROLES = ['admin', 'teacher', 'viewer'];
module.exports = handler(async (req, res) => {
  const qs = query(req); const { u, c } = await C.access(req, qs.code, 'owner');
  if(req.method === 'GET'){ const rows = (await q('SELECT a.id,a.email,a.role,a.grp,a.created_at,(SELECT name FROM users WHERE lower(email)=lower(a.email)) AS name, EXISTS(SELECT 1 FROM users WHERE lower(email)=lower(a.email)) AS registered FROM comp_admins a WHERE comp_code=$1 ORDER BY a.id', [c.code])).rows;
    return send(res, 200, { admins: rows }); }
  if(req.method === 'DELETE'){ const id = parseInt(qs.id, 10); if(!id) throw err(400, 'id required'); const r = await one('DELETE FROM comp_admins WHERE id=$1 AND comp_code=$2 RETURNING email,role', [id, c.code]); if(r) await C.log(u.email, c.code, 'admin.remove', r); return send(res, 200, { deleted: true }); }
  const b = await body(req); const email = str(b.email, 120).toLowerCase(), role = ROLES.includes(b.role) ? b.role : 'admin', grp = role === 'teacher' ? str(b.grp, 40) : '';
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err(400, 'Enter a valid email address', 'invalid_email');
  if(role === 'teacher' && !grp) throw err(400, 'A teacher needs a class or team', 'grp_required');
  const n = await one('SELECT count(*) AS n FROM comp_admins WHERE comp_code=$1', [c.code]); if(parseInt(n.n, 10) >= 50) throw err(429, 'Too many admins', 'full');
  const r = await one('INSERT INTO comp_admins(comp_code,email,role,grp) VALUES($1,$2,$3,$4) ON CONFLICT (comp_code,email) DO UPDATE SET role=EXCLUDED.role, grp=EXCLUDED.grp RETURNING id,email,role,grp', [c.code, email, role, grp]);
  await C.log(u.email, c.code, 'admin.add', { email, role, grp });
  send(res, 201, { admin: r });
}, ['GET', 'POST', 'DELETE']);
