// Google ニュース RSS（銘柄名で検索・直近7日）
'use strict';
const { classify } = require('./classify');

function unesc(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim();
}
function tag(xml, name) { const m = xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>')); return m ? unesc(m[1]) : ''; }

// RSS の文字列 → [{title, link, date, source, cats}]（新しい順・重複除去）
function parseRss(xml, max) {
  const items = [];
  const seen = {};
  (xml.match(/<item>[\s\S]*?<\/item>/g) || []).forEach(function (it) {
    let title = tag(it, 'title');
    const source = tag(it, 'source');
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    const link = tag(it, 'link');
    const pub = tag(it, 'pubDate');
    const d = pub ? new Date(pub) : null;
    const key = title.replace(/\s+/g, '');
    if (!title || seen[key]) return;
    seen[key] = true;
    items.push({ title: title, link: link, date: d && !isNaN(d) ? d.toISOString() : '', source: source, cats: classify(title) });
  });
  items.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  return items.slice(0, max || 8);
}

// 検索語: 銘柄名（JPX の表記）。「株式会社」などは付かない。短すぎる名前は証券コードも足す
function query(name, code) {
  const q = '"' + name + '"' + (String(name).length <= 2 ? ' ' + code : '') + ' when:7d';
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=ja&gl=JP&ceid=JP:ja';
}

async function fetchNews(name, code, max) {
  try {
    const r = await fetch(query(name, code), { headers: { 'User-Agent': 'kabu-check/0.1' } });
    if (!r.ok) return [];
    return parseRss(await r.text(), max);
  } catch (e) { return []; }
}

module.exports = { parseRss, fetchNews, query };
