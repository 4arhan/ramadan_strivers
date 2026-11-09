// Join (anonymous or signed-in), claim a pre-enrolled place (?t=), or update name/group with an existing token.
const { handler, send, body, query, str, err, token } = require('../../../_lib/util');
const { one, q } = require('../../../_lib/db'); const A = require('../../../_lib/auth'); const C = require('../../../_lib/comp');
module.exports = handler(async (req, res) => {
  const c = await C.getComp(query(req).code); const b = await body(req); const u = await A.optionalUser(req);
  const name = str(b.name, 40), grp = str(b.grp, 40);
  let p = null;
  if(b.t){ p = await one('SELECT * FROM participants WHERE comp_code=$1 AND token=$2', [c.code, String(b.t)]); if(!p) throw err(404, 'This invitation link is not valid for this competition', 'bad_invite');
    p = await one('UPDATE participants SET claimed=true, grp=COALESCE(NULLIF($3,\'\'),grp), user_id=COALESCE($4,user_id), updated_at=now() WHERE id=$1 AND comp_code=$2 RETURNING *', [p.id, c.code, grp, u ? u.id : null]); }
  else if(b.token){ p = await one('SELECT * FROM participants WHERE comp_code=$1 AND token=$2', [c.code, String(b.token)]); if(!p) throw err(404, 'Participant not found', 'not_found');
    p = await one('UPDATE participants SET name=COALESCE(NULLIF($3,\'\'),name), grp=$4, user_id=COALESCE($5,user_id), updated_at=now() WHERE id=$1 AND comp_code=$2 RETURNING *', [p.id, c.code, name, grp, u ? u.id : null]); }
  else { if(!c.open) throw err(403, 'This competition has been closed by the organiser.', 'closed'); if(!name) throw err(400, 'Display name required', 'name_required');
    const n = await one('SELECT count(*) AS n FROM participants WHERE comp_code=$1', [c.code]); if(parseInt(n.n, 10) >= 5000) throw err(429, 'This competition is full', 'full');
    p = await one('INSERT INTO participants(comp_code,token,user_id,name,grp) VALUES($1,$2,$3,$4,$5) RETURNING *', [c.code, token(18), u ? u.id : null, name, grp]); }
  send(res, 200, { token: p.token, participant: { id: p.id, name: p.name, grp: p.grp }, competition: C.publicComp(c) });
}, ['POST']);
