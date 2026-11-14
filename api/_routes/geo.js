// City search for prayer times: GET /api/geo?q=Dhaka&lang=bn → { results: [{ name, region, country, cc, lat, lng, tz }] }.
// Asks the Open-Meteo geocoding service (GeoNames data, no key) on the user's behalf, so the user's address is not sent
// to a third party; only the typed text is passed on. Answers are cached by the CDN for a day.
const { handler, send, query, str } = require('../_lib/util');
const LANGS = /^[a-z]{2}$/;
module.exports = handler(async (req, res) => {
  const qs = query(req), q = str(qs.q, 80), lang = LANGS.test(qs.lang || '') ? qs.lang : 'en';
  if(q.length < 2) return send(res, 200, { results: [] });
  let j;
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=15&format=json&language=' + lang + '&name=' + encodeURIComponent(q), { signal: ctl.signal });
    clearTimeout(timer);
    if(!r.ok) throw new Error('geocoder ' + r.status);
    j = await r.json();
  } catch(e){ return send(res, 502, { error: 'geo_unavailable' }); }
  const results = (Array.isArray(j && j.results) ? j.results : [])
    .filter(x => x && isFinite(x.latitude) && isFinite(x.longitude) && x.timezone && /^(PPL|ADM)/.test(x.feature_code || 'PPL'))
    .slice(0, 10)
    .map(x => ({ name: str(x.name, 80), region: str(x.admin1, 80), country: str(x.country, 80), cc: str(x.country_code, 2).toUpperCase(),
      lat: Math.round(x.latitude * 1000) / 1000, lng: Math.round(x.longitude * 1000) / 1000, tz: str(x.timezone, 60), pop: x.population || 0 }));
  send(res, 200, { results }, { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' });
}, ['GET']);
