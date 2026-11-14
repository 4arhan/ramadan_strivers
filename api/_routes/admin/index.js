// Super admin (SUPER_ADMIN_EMAILS). GET: platform numbers and every competition. PATCH {code, verified?, suspended?}:
// verify or suspend one. DELETE ?code=: remove one. Everything is written to the audit log.
const { handler, send, body, query, err } = require('../../_lib/util'); const { q, one } = require('../../_lib/db'); const A = require('../../_lib/auth'); const C = require('../../_lib/comp');
async function superUser(req){ const u = await A.requireUser(req); if(!C.isSuper(u)) throw err(403, 'Super admin only', 'forbidden'); return u; }
module.exports = handler(async (req, res) => {
  const u = await superUser(req); const qs = query(req);
  if(req.method === 'GET'){
    const n = async (sql) => parseInt((await one(sql, [])).n, 10) || 0;
    const totals = { users: await n('SELECT count(*) AS n FROM users'), competitions: await n('SELECT count(*) AS n FROM competitions'), participants: await n('SELECT count(*) AS n FROM participants WHERE claimed'),
      activeWeek: await n('SELECT count(*) AS n FROM participants WHERE claimed AND updated_at > now() - interval \'7 days\''), points: await n('SELECT COALESCE(sum(total_pts),0) AS n FROM participants'),
      quranPages: await n('SELECT COALESCE(sum(quran_pages),0) AS n FROM participants'), syncAccounts: await n('SELECT count(*) AS n FROM sync_data'), buddies: await n('SELECT count(*) AS n FROM buddies'), pushSubs: await n('SELECT count(*) AS n FROM push_subs'),
      newUsersWeek: await n('SELECT count(*) AS n FROM users WHERE created_at > now() - interval \'7 days\'') };
    const comps = (await q(`SELECT c.code,c.name,c.type,c.open,c.settings,c.created_at,u.email AS owner,
      (SELECT count(*) FROM participants p WHERE p.comp_code=c.code AND p.claimed) AS participants,
      (SELECT count(*) FROM participants p WHERE p.comp_code=c.code AND p.claimed AND p.updated_at > now() - interval '7 days') AS active,
      (SELECT max(p.updated_at) FROM participants p WHERE p.comp_code=c.code) AS last_active
      FROM competitions c LEFT JOIN users u ON u.id=c.owner_id ORDER BY c.created_at DESC LIMIT 2000`, [])).rows;
    const byCountry = {}, byType = {};
    const list = comps.map(c => { const s = c.settings || {}, p = parseInt(c.participants, 10) || 0; const cc = s.country || '??'; byCountry[cc] = (byCountry[cc] || 0) + p; byType[c.type] = (byType[c.type] || 0) + 1;
      return { code: c.code, name: c.name, type: c.type, open: c.open, owner: c.owner, country: s.country || '', verified: !!s.verified, suspended: !!s.suspended, participants: p, active: parseInt(c.active, 10) || 0, created: c.created_at, lastActive: c.last_active }; });
    return send(res, 200, { totals, byCountry, byType, competitions: list }); }
  if(req.method === 'DELETE'){ const c = await C.getComp(qs.code, true); await q('DELETE FROM competitions WHERE code=$1', [c.code]); await C.log(u.email, c.code, 'super.delete', { name: c.name }); return send(res, 200, { deleted: true }); }
  const b = await body(req); const c = await C.getComp(b.code, true); const s = Object.assign({}, c.settings || {});
  if(typeof b.verified === 'boolean'){ if(b.verified) s.verified = true; else delete s.verified; }
  if(typeof b.suspended === 'boolean'){ if(b.suspended) s.suspended = true; else delete s.suspended; }
  await q('UPDATE competitions SET settings=$2 WHERE code=$1', [c.code, JSON.stringify(s)]);
  await C.log(u.email, c.code, 'super.update', { verified: !!s.verified, suspended: !!s.suspended });
  send(res, 200, { code: c.code, verified: !!s.verified, suspended: !!s.suspended });
}, ['GET', 'PATCH', 'DELETE']);
module.exports.superUser = superUser;
