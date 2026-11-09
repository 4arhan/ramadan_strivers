const { handler, send, query } = require('../../../_lib/util'); const C = require('../../../_lib/comp');
module.exports = handler(async (req, res) => {
  const qs = query(req); const c = await C.getComp(qs.code); const b = await C.board(c.code, qs.token || null);
  res.setHeader('Cache-Control', 'no-store'); send(res, 200, Object.assign({ competition: C.publicComp(c) }, b));
}, ['GET']);
