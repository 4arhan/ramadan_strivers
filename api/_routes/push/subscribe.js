const { handler, send, body, err, str } = require('../../_lib/util'); const { q } = require('../../_lib/db'); const A = require('../../_lib/auth');
module.exports = handler(async (req, res) => {
  const b = await body(req); const u = await A.optionalUser(req);
  if(req.method === 'DELETE'){ if(!b.endpoint) throw err(400, 'endpoint required'); await q('DELETE FROM push_subs WHERE endpoint=$1', [b.endpoint]); return send(res, 200, { removed: true }); }
  const sub = b.sub; if(!sub || !sub.endpoint || !sub.keys) throw err(400, 'push subscription required');
  const prefs = { daily: b.prefs && b.prefs.daily !== false, iftar: !!(b.prefs && b.prefs.iftar), oddNights: !(b.prefs && b.prefs.oddNights === false), hour: Math.max(0, Math.min(23, parseInt(b.prefs && b.prefs.hour, 10) || 20)) };
  const lat = isFinite(parseFloat(b.lat)) ? parseFloat(b.lat) : null, lng = isFinite(parseFloat(b.lng)) ? parseFloat(b.lng) : null;
  await q('INSERT INTO push_subs(user_id,endpoint,sub,prefs,tz,lat,lng,lang) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (endpoint) DO UPDATE SET user_id=COALESCE(EXCLUDED.user_id,push_subs.user_id), sub=EXCLUDED.sub, prefs=EXCLUDED.prefs, tz=EXCLUDED.tz, lat=EXCLUDED.lat, lng=EXCLUDED.lng, lang=EXCLUDED.lang',
    [u ? u.id : null, sub.endpoint, JSON.stringify(sub), JSON.stringify(prefs), str(b.tz, 60) || null, lat, lng, str(b.lang, 5) || 'en']);
  send(res, 200, { subscribed: true, prefs });
}, ['POST', 'DELETE']);
