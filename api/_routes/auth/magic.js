// Passwordless sign-in: POST {email} sends a link; GET ?token= exchanges it for a session.
const { handler, send, body, query, str, err, token, origin } = require('../../_lib/util');
const { one, q } = require('../../_lib/db'); const A = require('../../_lib/auth'); const mail = require('../../_lib/email');
module.exports = handler(async (req, res) => {
  if(req.method === 'POST'){
    if(!mail.configured()) throw err(503, 'Email sign-in is not enabled on this server (RESEND_API_KEY). Use email + password instead.', 'email_not_configured');
    const b = await body(req); const email = str(b.email, 120).toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err(400, 'Valid email required', 'invalid_email');
    const t = token(24); await q('INSERT INTO magic_links(token,email,expires_at) VALUES($1,$2,now()+interval \'20 minutes\')', [t, email]);
    const link = origin(req) + '/?magic=' + t;
    await mail.sendEmail({ to: email, subject: 'Your Ramadan Strivers sign-in link', text: 'Sign in: ' + link, html: mail.layout('Sign in to Ramadan Strivers', `<p>Tap the button to sign in. The link works once and expires in 20 minutes.</p><p style="text-align:center;margin:22px 0"><a href="${link}" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600">Sign in</a></p><p style="color:#78716c;font-size:13px">If you didn't request this, you can ignore this email.</p>`) });
    return send(res, 200, { sent: true });
  }
  const t = query(req).token; if(!t) throw err(400, 'token required');
  const row = await one('SELECT * FROM magic_links WHERE token=$1', [t]);
  if(!row || row.used || new Date(row.expires_at) < new Date()) throw err(400, 'This sign-in link is invalid or has expired', 'bad_link');
  await q('UPDATE magic_links SET used=true WHERE token=$1', [t]);
  let u = await one('SELECT id,email,name,settings FROM users WHERE email=$1', [row.email]);
  if(!u) u = await one('INSERT INTO users(email) VALUES($1) RETURNING id,email,name,settings', [row.email]);
  send(res, 200, { token: A.sign({ uid: u.id }), user: A.publicUser(u) });
}, ['GET', 'POST']);
