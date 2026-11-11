// Accountability buddies. No account needed: POST creates a share with a public view code and a private owner token.
// A buddy who has the code can read the summary and send one of a few preset encouragements, never free text.
const { handler, send, body, rand, token, str } = require('../../_lib/util'); const { one, q } = require('../../_lib/db'); const B = require('../../_lib/buddy');
module.exports = handler(async (req, res) => {
  const b = await body(req); const name = str(b.name, 24); if(!name) throw B.err(400, 'Enter a display name', 'name_required');
  let code; for(let i = 0; i < 20; i++){ code = rand(8); if(!(await one('SELECT 1 FROM buddies WHERE code=$1', [code]))) break; }
  const tk = token(18);
  await q('INSERT INTO buddies(code,token,name,summary) VALUES($1,$2,$3,$4)', [code, tk, name, JSON.stringify(B.cleanSummary(b.summary))]);
  send(res, 201, { code, token: tk, name });
}, ['POST']);
