// Hijri date via the Umm al-Qura calendar built into Intl. Optional ±day offset for local moon sighting.
const LANG_LOCALES = { en: 'en-u-ca-islamic-umalqura' };
function hijri(date, offsetDays){
  const d = new Date((date || new Date()).getTime() + (offsetDays || 0) * 86400000);
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(d);
  const o = {}; parts.forEach(p => { if(p.type !== 'literal') o[p.type] = parseInt(p.value, 10); });
  return { day: o.day, month: o.month, year: o.year }; // month 9 = Ramadan, 10 = Shawwal, 12 = Dhul Hijjah, 8 = Sha'ban, 1 = Muharram
}
const MONTHS = ['Muharram','Safar',"Rabi' al-Awwal","Rabi' al-Thani",'Jumada al-Ula','Jumada al-Akhirah','Rajab',"Sha'ban",'Ramadan','Shawwal',"Dhul Qa'dah",'Dhul Hijjah'];
module.exports = { hijri, MONTHS };
