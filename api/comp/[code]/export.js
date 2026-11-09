const { handler, query } = require('../../_lib/util'); const { q } = require('../../_lib/db'); const C = require('../../_lib/comp');
module.exports = handler(async (req, res) => {
  const { c } = await C.requireOwner(req, query(req).code);
  const rows = (await q('SELECT name,grp,total_pts,days_logged,avg_pct,quran_pages,last_day,flagged,hidden,claimed,created_at,updated_at FROM participants WHERE comp_code=$1 ORDER BY total_pts DESC', [c.code])).rows;
  const head = ['Rank', 'Name', 'Group', 'Points', 'Days logged', 'Avg %', 'Quran pages', 'Last day', 'Flagged', 'Hidden', 'Joined', 'Last update'];
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = [head].concat(rows.map((r, i) => [i + 1, r.name, r.grp, r.total_pts, r.days_logged, r.avg_pct, r.quran_pages, r.last_day, r.flagged, r.hidden, r.claimed ? 'yes' : 'not yet', new Date(r.created_at).toISOString().slice(0, 10), new Date(r.updated_at).toISOString().slice(0, 16)])).map(r => r.map(esc).join(',')).join('\r\n');
  res.statusCode = 200; res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="ramadan-competition-' + c.code + '.csv"'); res.end('﻿' + csv);
}, ['GET']);
