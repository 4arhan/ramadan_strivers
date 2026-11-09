const { handler, send, body, str } = require('../_lib/util');
const { q, one } = require('../_lib/db'); const A = require('../_lib/auth');
module.exports = handler(async (req, res) => {
  const u = await A.requireUser(req);
  if(req.method === 'PATCH'){ const b = await body(req); const name = b.name !== undefined ? str(b.name, 60) : u.name; const settings = Object.assign({}, u.settings || {}, b.settings || {});
    const nu = await one('UPDATE users SET name=$2, settings=$3 WHERE id=$1 RETURNING id,email,name,settings', [u.id, name || null, JSON.stringify(settings)]); return send(res, 200, { user: A.publicUser(nu) }); }
  if(req.method === 'DELETE'){ await q('DELETE FROM users WHERE id=$1', [u.id]); return send(res, 200, { deleted: true }); }
  const owned = (await q('SELECT code,name,type,open,created_at FROM competitions WHERE owner_id=$1 ORDER BY created_at DESC', [u.id])).rows;
  const joined = (await q('SELECT p.comp_code AS code, c.name, p.token, p.name AS display_name, p.grp FROM participants p JOIN competitions c ON c.code=p.comp_code WHERE p.user_id=$1', [u.id])).rows;
  send(res, 200, { user: A.publicUser(u), owned, joined });
}, ['GET', 'PATCH', 'DELETE']);
