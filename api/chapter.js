// Serves one chapter of NIV, NKJV or AMP from API.Bible.
// The API key stays here on the server (Vercel environment variable API_BIBLE_KEY).
// Vercel's edge keeps each chapter for up to 30 days, so API.Bible is called
// about once per chapter per month, no matter how many people read it.

const BOOKS = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];
const VERSIONS = ['NIV', 'NKJV', 'AMP'];
const API = 'https://rest.api.bible/v1';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

let bibleIds = null; // looked up once per server instance

async function api(path, key) {
  const r = await fetch(API + path, { headers: { 'api-key': key } });
  if (!r.ok) { const e = new Error('api.bible ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

// Find the Bible ID for each version among the Bibles this key is licensed for.
// You can also set BIBLE_ID_NIV / BIBLE_ID_NKJV / BIBLE_ID_AMP in Vercel to pin them.
async function findIds(key) {
  if (bibleIds) return bibleIds;
  const ids = {};
  for (const v of VERSIONS) if (process.env['BIBLE_ID_' + v]) ids[v] = process.env['BIBLE_ID_' + v];
  if (VERSIONS.some(v => !ids[v])) {
    const { data } = await api('/bibles?language=eng', key);
    for (const v of VERSIONS) {
      if (ids[v]) continue;
      const match = data.find(x => (x.abbreviationLocal || '').toUpperCase() === v || (x.abbreviation || '').toUpperCase() === v)
        || data.find(x => (x.abbreviation || '').toUpperCase().replace(/\d+$/, '') === v);
      if (match) ids[v] = match.id;
    }
  }
  return (bibleIds = ids);
}

// "[1] In the beginning ... [2] And the earth ..." -> ["In the beginning ...", "And the earth ..."]
function toVerses(content) {
  const parts = content.split(/\[(\d+)\]/);
  const verses = [];
  for (let i = 1; i < parts.length; i += 2) {
    const n = parseInt(parts[i], 10), text = (parts[i + 1] || '').replace(/\s+/g, ' ').trim();
    if (n >= 1) verses[n - 1] = verses[n - 1] ? verses[n - 1] + ' ' + text : text;
  }
  for (let i = 0; i < verses.length; i++) if (verses[i] == null) verses[i] = '';
  return verses;
}

module.exports = async function handler(req, res) {
  const v = String(req.query.v || '').toUpperCase();
  const b = parseInt(req.query.b, 10), c = parseInt(req.query.c, 10);
  const fail = (status, error) => { res.setHeader('Cache-Control', 'no-store'); res.status(status).json({ error }); };

  if (!VERSIONS.includes(v) || !(b >= 1 && b <= 66) || !(c >= 1 && c <= 150)) return fail(400, 'bad_request');
  const key = process.env.API_BIBLE_KEY;
  if (!key) return fail(503, 'not_configured');

  try {
    const ids = await findIds(key);
    if (!ids[v]) return fail(404, 'version_not_licensed');
    const q = 'content-type=text&include-verse-numbers=true&include-titles=false&include-notes=false&include-chapter-numbers=false';
    const { data, meta } = await api(`/bibles/${ids[v]}/chapters/${BOOKS[b - 1]}.${c}?${q}`, key);
    const verses = toVerses(data.content || '');
    if (!verses.length) return fail(502, 'empty_chapter');
    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${THIRTY_DAYS}`);
    res.status(200).json({
      version: v, b, c, verses,
      copyright: data.copyright || '',
      fumsToken: (meta && (meta.fumsToken || meta.fumsId)) || null,
      fetchedAt: Date.now()
    });
  } catch (e) {
    if (e.status === 401) return fail(503, 'bad_key');
    if (e.status === 403) return fail(404, 'version_not_licensed');
    if (e.status === 429) return fail(503, 'monthly_limit');
    return fail(502, 'upstream_error');
  }
}
