const { handler, send, body, str, err } = require('../../_lib/util');
const { one } = require('../../_lib/db'); const A = require('../../_lib/auth');
module.exports = handler(async (req, res) => {
  const b = await body(req); const email = str(b.email, 120).toLowerCase(); const pw = String(b.password || '');
  const u = await one('SELECT id,email,name,settings,pass_hash FROM users WHERE email=$1', [email]);
  if(!u || !A.verifyPassword(pw, u.pass_hash)) throw err(401, 'Incorrect email or password', 'bad_credentials');
  send(res, 200, { token: A.sign({ uid: u.id }), user: A.publicUser(u) });
}, ['POST']);
