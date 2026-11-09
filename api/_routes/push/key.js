const { handler, send } = require('../../_lib/util');
module.exports = handler(async (req, res) => { const k = process.env.VAPID_PUBLIC_KEY || null; send(res, 200, { enabled: !!(k && process.env.VAPID_PRIVATE_KEY), publicKey: k }, { 'Cache-Control': 'public, max-age=3600' }); }, ['GET']);
