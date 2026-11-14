// Weekly rounds and awards (public, like the board): ?week=1..4, default the current week.
const { handler, send, query } = require('../../../_lib/util'); const C = require('../../../_lib/comp');
module.exports = handler(async (req, res) => {
  const qs = query(req); const c = await C.getComp(qs.code);
  send(res, 200, Object.assign({ competition: { code: c.code, name: c.name } }, await C.awards(c.code, parseInt(qs.week, 10) || 0)));
}, ['GET']);
