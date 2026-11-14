// A league's table as JSON (public): divisions with ranked organisations, and the charity table.
const { handler, send, query, err } = require('../../_lib/util'); const L = require('../../_lib/league');
module.exports = handler(async (req, res) => {
  const l = await L.bySlug(query(req).slug); if(!l) throw err(404, 'League not found', 'not_found');
  send(res, 200, await L.table(l), { 'Cache-Control': 'public, max-age=60' });
}, ['GET']);
