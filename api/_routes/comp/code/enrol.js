// Bulk enrolment: organiser submits names (optionally with group); each gets a personal invitation link.
const { handler, send, body, query, str, err, token, origin } = require('../../../_lib/util');
const { q } = require('../../../_lib/db'); const C = require('../../../_lib/comp');
module.exports = handler(async (req, res) => {
  const { c } = await C.requireOwner(req, query(req).code); const b = await body(req);
  // A line is "name, group". Accept the comma and semicolon of every supported keyboard (Arabic/Urdu ، ؛,
  // full-width ， ；, ideographic 、), not only ASCII, so organisers can type the separator they see in the hint.
  let list = Array.isArray(b.names) ? b.names : String(b.text || '').split(/\r?\n/).map(l => { const parts = l.split(/[,\t;،؛，；、]/); return { name: parts[0], grp: parts[1] || b.grp || '' }; });
  list = list.map(x => ({ name: str(typeof x === 'string' ? x : x.name, 40), grp: str(typeof x === 'string' ? (b.grp || '') : (x.grp || b.grp || ''), 40) })).filter(x => x.name);
  if(!list.length) throw err(400, 'No names provided'); if(list.length > 1000) throw err(413, 'Max 1000 names per batch');
  const base = origin(req); const out = [];
  for(const x of list){ const t = token(18); const r = await q('INSERT INTO participants(comp_code,token,name,grp,claimed) VALUES($1,$2,$3,$4,false) RETURNING id', [c.code, t, x.name, x.grp]); out.push({ id: r.rows[0].id, name: x.name, grp: x.grp, token: t, link: base + '/?join=' + c.code + '&t=' + t }); }
  send(res, 201, { enrolled: out.length, participants: out });
}, ['POST']);
