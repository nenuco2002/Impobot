// netlify/functions/news.js
// Trae novedades impositivas/contables/laborales de Argentina en tiempo real
// desde Google News RSS (server-side, sin dependencias externas) y las
// devuelve como JSON para que index.html las muestre en "Últimas novedades".
// No requiere build ni npm install: usa fetch nativo de Node 18+.

const QUERIES = [
  '(ARCA OR AFIP) (monotributo OR "impuesto a las ganancias" OR IVA OR "ingresos brutos" OR vencimiento OR resolución) Argentina',
  '(sueldos OR "cargas sociales" OR SIPA OR jubilación OR SMVyM OR aportes) Argentina',
];

const RELEVANT_RE = /ARCA|AFIP|monotribut|ganancias|IVA\b|ingresos brutos|IIBB|sueldo|jubila|SMVyM|UVA|cargas sociales|impuesto|retenci[oó]n|DDJJ|declaraci[oó]n jurada|aporte|pat[oó]n|contribuci[oó]n|convenio multilateral|LSD|autónomo|F\.?931/i;

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function extractTag(block, tag) {
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function stripCdata(s) {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/);
  return m ? m[1] : s;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '');
}

function clean(s) {
  return decodeEntities(stripTags(stripCdata(s || ''))).replace(/\s+/g, ' ').trim();
}

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function formatDate(d) {
  return d.getDate() + ' ' + MONTHS_ES[d.getMonth()];
}

async function fetchQuery(q) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=es-419&gl=AR&ceid=AR:es';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImpoBotNewsFetcher/1.0)' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const block of itemBlocks) {
      const rawTitle = clean(extractTag(block, 'title'));
      const link = clean(extractTag(block, 'link'));
      const pubDateStr = clean(extractTag(block, 'pubDate'));
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
      const source = sourceMatch ? clean(sourceMatch[1]) : '';

      let title = rawTitle;
      if (source && title.endsWith(' - ' + source)) {
        title = title.slice(0, title.length - (source.length + 3)).trim();
      } else {
        const idx = title.lastIndexOf(' - ');
        if (idx > 0) title = title.slice(0, idx).trim();
      }

      const pubDate = pubDateStr ? new Date(pubDateStr) : null;
      if (!title || !link || !pubDate || isNaN(pubDate.getTime())) continue;
      if (!RELEVANT_RE.test(title)) continue;

      items.push({ title, link, source, date: pubDate.toISOString(), dateLabel: formatDate(pubDate) });
    }
    return items;
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

exports.handler = async function () {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=21600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const results = await Promise.all(QUERIES.map(fetchQuery));
    const all = results.flat();

    const seen = new Set();
    const deduped = [];
    for (const item of all) {
      const key = normalize(item.title).slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    deduped.sort((a, b) => new Date(b.date) - new Date(a.date));
    const top = deduped.slice(0, 6).map(({ title, link, source, dateLabel }) => ({ title, link, source, dateLabel }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, items: top, updated: new Date().toISOString() }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, items: [] }),
    };
  }
};
