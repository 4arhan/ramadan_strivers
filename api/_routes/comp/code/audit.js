// What the admins of a competition changed, and when (admins and the owner).
const { handler, send, query } = require('../../../_lib/util'); const { q } = require('../../../_lib/db'); const C = require('../../../_lib/comp');
module.exports = handler(async (req, res) => {
  const { c } = await C.access(req, query(req).code, 'admin');
  const rows = (await q('SELECT at,email,action,detail FROM audit WHERE comp_code=$1 ORDER BY id DESC LIMIT 100', [c.code])).rows;
  send(res, 200, { log: rows });
}, ['GET']);
