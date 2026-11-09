const { handler, send, body, str, err } = require('../_lib/util');
const { one } = require('../_lib/db'); const A = require('../_lib/auth');
module.exports = handler(async (req, res) => {
  const b = await body(req); const email = str(b.email, 120).toLowerCase(); const pw = String(b.password || ''); const name = str(b.name, 60);
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err(400, 'Valid email required', 'invalid_email');
  if(pw.length < 6) throw err(400, 'Password must be at least 6 characters', 'weak_password');
  const exists = await one('SELECT id FROM users WHERE email=$1', [email]); if(exists) throw err(409, 'An account with this email already exists — log in instead', 'email_in_use');
  const u = await one('INSERT INTO users(email,pass_hash,name) VALUES($1,$2,$3) RETURNING id,email,name,settings', [email, A.hashPassword(pw), name || null]);
  send(res, 201, { token: A.sign({ uid: u.id }), user: A.publicUser(u) });
}, ['POST']);
