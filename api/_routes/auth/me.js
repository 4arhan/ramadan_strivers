const { handler, send, body, str } = require('../../_lib/util');
const { q, one } = require('../../_lib/db'); const A = require('../../_lib/auth'); const C = require('../../_lib/comp');
module.exports = handler(async (req, res) => {
  const u = await A.requireUser(req);
  if(req.method === 'PATCH'){ const b = await body(req); const name = b.name !== undefined ? str(b.name, 60) : u.name; const settings = Object.assign({}, u.settings || {}, b.settings || {});
    const nu = await one('UPDATE users SET name=$2, settings=$3 WHERE id=$1 RETURNING id,email,name,settings', [u.id, name || null, JSON.stringify(settings)]); return send(res, 200, { user: A.publicUser(nu) }); }
  if(req.method === 'DELETE'){ await q('DELETE FROM users WHERE id=$1', [u.id]); return send(res, 200, { deleted: true }); }
  const owned = (await q('SELECT code,name,type,open,created_at FROM competitions WHERE owner_id=$1 ORDER BY created_at DESC', [u.id])).rows;
  const joined = (await q('SELECT p.comp_code AS code, c.name, p.token, p.name AS display_name, p.grp FROM participants p JOIN competitions c ON c.code=p.comp_code WHERE p.user_id=$1', [u.id])).rows;
  const managed = u.email ? (await q('SELECT c.code,c.name,c.type,a.role,a.grp FROM comp_admins a JOIN competitions c ON c.code=a.comp_code WHERE lower(a.email)=lower($1) AND c.owner_id<>$2', [u.email, u.id])).rows : [];
  // notes from Ramadan Strivers to the people who run competitions
  const notices = (owned.length || managed.length || C.isSuper(u)) ? (await q('SELECT id,text,created_at FROM notices ORDER BY id DESC LIMIT 3', [])).rows : [];
  send(res, 200, { user: A.publicUser(u), owned, joined, managed, notices, super: C.isSuper(u) });
}, ['GET', 'PATCH', 'DELETE']);
