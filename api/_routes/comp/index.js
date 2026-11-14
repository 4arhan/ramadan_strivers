const { handler, send, body, str } = require('../../_lib/util');
const { q, one } = require('../../_lib/db'); const A = require('../../_lib/auth'); const C = require('../../_lib/comp');
module.exports = handler(async (req, res) => {
  const u = await A.requireUser(req);
  if(req.method === 'GET'){ const rows = (await q('SELECT c.*, (SELECT count(*) FROM participants p WHERE p.comp_code=c.code AND p.claimed) AS participants FROM competitions c WHERE owner_id=$1 ORDER BY created_at DESC', [u.id])).rows;
    // competitions this account helps to run (added by email as admin, teacher or viewer)
    const managed = u.email ? (await q('SELECT c.*, a.role AS my_role, a.grp AS my_grp, (SELECT count(*) FROM participants p WHERE p.comp_code=c.code AND p.claimed) AS participants FROM comp_admins a JOIN competitions c ON c.code=a.comp_code WHERE lower(a.email)=lower($1) AND c.owner_id<>$2 ORDER BY c.created_at DESC', [u.email, u.id])).rows : [];
    const out = c => Object.assign(C.publicComp(c), { participants: parseInt(c.participants, 10), settings: c.settings, role: c.my_role || 'owner', myGrp: c.my_grp || '' });
    return send(res, 200, { competitions: rows.concat(managed.filter(c => !(c.settings || {}).suspended)).map(out), super: C.isSuper(u) }); }
  const b = await body(req); const name = str(b.name, 80); if(!name) throw Object.assign(new Error('Organisation name required'), { status: 400 });
  const type = C.TYPES.includes(b.type) ? b.type : 'Other';
  const prizes = Array.isArray(b.prizes) ? b.prizes.slice(0, 10).map(p => str(p, 80)) : [];
  const settings = sanitizeSettings(b.settings || {});
  const code = await C.newCode();
  const c = await one('INSERT INTO competitions(code,name,type,owner_id,prizes,settings) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [code, name, type, u.id, JSON.stringify(prizes), JSON.stringify(settings)]);
  await C.log(u.email, c.code, 'comp.create', { name, type });
  send(res, 201, { competition: Object.assign(C.publicComp(c), { settings: c.settings, role: 'owner' }) });
}, ['GET', 'POST']);
function sanitizeSettings(s){ const o = {}; if(s.dailyCap) o.dailyCap = Math.max(50, Math.min(C.HARD_MAX_DAY, parseInt(s.dailyCap, 10) || 0)); if(s.teams === false) o.teams = false; if(s.donateUrl) o.donateUrl = str(s.donateUrl, 300); if(s.sponsor) o.sponsor = str(s.sponsor, 120); if(s.message) o.message = str(s.message, 300); if(s.endDay) o.endDay = Math.max(1, Math.min(30, parseInt(s.endDay, 10) || 30)); if(s.under13) o.under13 = true; 
  // a community goal everyone works towards: points, Quran pages or days logged
  if(s.goal === null) o.goal = null; else if(s.goal && ['pts', 'q', 'dl'].includes(s.goal.k)){ const n = parseInt(s.goal.n, 10); if(n >= 1 && n <= 100000000) o.goal = { k: s.goal.k, n }; }
  // the organiser's own deeds (up to 6, 1 to 30 points each) and double-points days
  if(Array.isArray(s.custom)) o.custom = s.custom.slice(0, 6).map((d, i) => ({ id: 'c' + (i + 1), label: str(d && d.label, 60), pts: Math.max(1, Math.min(30, parseInt(d && d.pts, 10) || 5)) })).filter(d => d.label);
  if(Array.isArray(s.bonus)) o.bonus = Array.from(new Set(s.bonus.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 30))).slice(0, 6).sort((a, b) => a - b);
  // money raised for charity, as reported by the organiser
  if(s.charity === null) o.charity = null; else if(s.charity){ const tgt = Math.max(0, Math.min(1e9, parseFloat(s.charity.target) || 0)), raised = Math.max(0, Math.min(1e9, parseFloat(s.charity.raised) || 0)); o.charity = { target: tgt, raised, currency: str(s.charity.currency, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'USD', cause: str(s.charity.cause, 80) }; }
  if(s.country !== undefined) o.country = str(s.country, 2).toUpperCase().replace(/[^A-Z]/g, '');
  if(s.message !== undefined) o.messageAt = new Date().toISOString();
  return o; }
module.exports.sanitizeSettings = sanitizeSettings;
