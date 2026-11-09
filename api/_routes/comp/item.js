const { handler, send, body, query, str } = require('../../_lib/util');
const { one, q } = require('../../_lib/db'); const C = require('../../_lib/comp'); const { sanitizeSettings } = require('./index');
module.exports = handler(async (req, res) => {
  const code = String(query(req).code || '').toUpperCase();
  if(req.method === 'GET'){ const c = await C.getComp(code); const n = await one('SELECT count(*) AS n FROM participants WHERE comp_code=$1 AND claimed AND hidden=false', [c.code]); return send(res, 200, { competition: Object.assign(C.publicComp(c), { participants: parseInt(n.n, 10) }) }); }
  const { c } = await C.requireOwner(req, code);
  if(req.method === 'DELETE'){ await q('DELETE FROM competitions WHERE code=$1', [c.code]); return send(res, 200, { deleted: true }); }
  const b = await body(req);
  const name = b.name !== undefined ? (str(b.name, 80) || c.name) : c.name;
  const prizes = Array.isArray(b.prizes) ? b.prizes.slice(0, 10).map(p => str(p, 80)) : c.prizes;
  const open = typeof b.open === 'boolean' ? b.open : c.open;
  const settings = b.settings ? Object.assign({}, c.settings || {}, sanitizeSettings(b.settings)) : c.settings;
  if(b.settings){ ['dailyCap', 'donateUrl', 'sponsor', 'message'].forEach(k => { if(b.settings[k] === '' || b.settings[k] === null) delete settings[k]; }); if(b.settings.teams === true) delete settings.teams; }
  const nc = await one('UPDATE competitions SET name=$2, prizes=$3, open=$4, settings=$5 WHERE code=$1 RETURNING *', [c.code, name, JSON.stringify(prizes), open, JSON.stringify(settings)]);
  send(res, 200, { competition: Object.assign(C.publicComp(nc), { settings: nc.settings }) });
}, ['GET', 'PATCH', 'DELETE']);
