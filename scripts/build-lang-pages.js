#!/usr/bin/env node
// Generates /lang/<code>/index.html for every language in languageList
// (except 'en', which is served at the root '/' as the default/x-default
// version) and injects the matching hreflang block into the root index.html.
//
// Each generated page is a thin skeleton: same body markup as the real
// homepage, loading the shared /app.js, with per-language <head> metadata
// (title, description, OG/Twitter tags, canonical, hreflang alternates) and
// a <base> tag so the page's relative asset/article links resolve correctly
// from inside /lang/<code>/. Re-run this script any time index.html's head
// template, the language list, or the metaTitle/metaDescription strings in
// app.js change, to keep the generated pages in sync.
//
// Usage: node scripts/build-lang-pages.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://motapacalculator.com';

const RTL_CODES = new Set(['ur', 'ar', 'ar-ae', 'ar-sa', 'ar-bh', 'ar-qa', 'ar-kw', 'fa', 'ps', 'he']);

function extractBetween(js, startMarker) {
  const startIdx = js.indexOf(startMarker);
  if (startIdx === -1) throw new Error('marker not found: ' + startMarker);
  let i = startIdx + startMarker.length - 1;
  let depth = 0, inStr = false, strChar = null, escaped = false, endIdx = -1;
  for (; i < js.length; i++) {
    const ch = js[i];
    if (inStr) {
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === strChar) { inStr = false; }
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) throw new Error('could not find matching end for: ' + startMarker);
  return js.slice(startIdx + startMarker.length - 1, endIdx + 1);
}

function flagToCountryCode(name) {
  const regionalIndicators = [...name].filter(ch => {
    const cp = ch.codePointAt(0);
    return cp >= 0x1F1E6 && cp <= 0x1F1FF;
  });
  if (regionalIndicators.length !== 2) return null;
  return regionalIndicators.map(ch => String.fromCharCode(ch.codePointAt(0) - 0x1F1E6 + 65)).join('');
}

function ogLocale(code, countryCode) {
  const base = code.split('-')[0];
  const region = code.includes('-') ? code.split('-')[1].toUpperCase() : (countryCode || base.toUpperCase());
  return base + '_' + region;
}

const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const languageListText = extractBetween(appJs, 'const languageList = [');
const languageList = eval(languageListText);
const translationsText = extractBetween(appJs, 'const translations = {');
const translations = eval('(' + translationsText + ')');

const codes = languageList.map(l => l.code);
console.log('Loaded', codes.length, 'language codes from app.js');

// Build the full reciprocal hreflang set: x-default + en both point to root,
// every other code points to /lang/<code>/.
const hreflangEntries = [{ hreflang: 'x-default', href: SITE + '/' }];
for (const code of codes) {
  const href = code === 'en' ? SITE + '/' : SITE + '/lang/' + code + '/';
  hreflangEntries.push({ hreflang: code, href });
}
function hreflangBlock(indent) {
  return hreflangEntries
    .map(e => indent + '<link rel="alternate" hreflang="' + e.hreflang + '" href="' + e.href + '">')
    .join('\n');
}

const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- 1. Update root index.html: add hreflang block after canonical link, leave everything else untouched ---
const canonicalLine = '  <link rel="canonical" href="https://motapacalculator.com/">';
if (!template.includes(canonicalLine)) throw new Error('canonical line not found in root index.html template');
if (!template.includes('rel="alternate" hreflang=')) {
  const updatedRoot = template.replace(
    canonicalLine,
    canonicalLine + '\n' + hreflangBlock('')
  );
  fs.writeFileSync(path.join(ROOT, 'index.html'), updatedRoot);
  console.log('Inserted hreflang block (' + hreflangEntries.length + ' entries) into root index.html');
} else {
  console.log('Root index.html already has an hreflang block, skipping re-insertion (re-run after a manual edit may duplicate it - check manually if this looks wrong)');
}

// --- 2. Generate /lang/<code>/index.html for every code except 'en' ---
const freshTemplate = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); // re-read after root edit above

let generated = 0;
for (const entry of languageList) {
  const code = entry.code;
  if (code === 'en') continue; // root already serves as the English / x-default version

  const t = translations[code];
  if (!t || !t.metaTitle || !t.metaDescription) {
    throw new Error('missing metaTitle/metaDescription for ' + code);
  }

  const dir = RTL_CODES.has(code) ? 'rtl' : 'ltr';
  const countryCode = flagToCountryCode(entry.name);
  const locale = ogLocale(code, countryCode);
  const pageUrl = SITE + '/lang/' + code + '/';
  const langName = entry.name.replace(/^[^\w\s]+\s*/u, '').trim(); // strip leading flag emoji

  let page = freshTemplate;

  page = page.replace('<html lang="en" dir="ltr">', '<html lang="' + code + '" dir="' + dir + '">');

  page = page.replace(
    /<title>[^<]*<\/title>/,
    '<title>' + t.metaTitle + '</title>'
  );
  page = page.replace(
    /<meta name="description" content="[^"]*">/,
    '<meta name="description" content="' + t.metaDescription.replace(/"/g, '&quot;') + '">'
  );
  page = page.replace(
    /<meta property="og:title" content="[^"]*">/,
    '<meta property="og:title" content="' + t.metaTitle.replace(/"/g, '&quot;') + '">'
  );
  page = page.replace(
    /<meta property="og:description" content="[^"]*">/,
    '<meta property="og:description" content="' + t.metaDescription.replace(/"/g, '&quot;') + '">'
  );
  page = page.replace(
    /<meta property="og:url" content="[^"]*">/,
    '<meta property="og:url" content="' + pageUrl + '">'
  );
  page = page.replace(
    /<meta property="og:locale" content="[^"]*">/,
    '<meta property="og:locale" content="' + locale + '">'
  );
  page = page.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    '<meta name="twitter:title" content="' + t.metaTitle.replace(/"/g, '&quot;') + '">'
  );
  page = page.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    '<meta name="twitter:description" content="' + t.metaDescription.replace(/"/g, '&quot;') + '">'
  );
  page = page.replace(
    /<meta name="twitter:url" content="[^"]*">/,
    '<meta name="twitter:url" content="' + pageUrl + '">'
  );
  page = page.replace(
    /<meta http-equiv="content-language" content="[^"]*">/,
    '<meta http-equiv="content-language" content="' + code + '">'
  );
  page = page.replace(
    /<meta name="language" content="[^"]*">/,
    '<meta name="language" content="' + langName + '">'
  );
  page = page.replace(
    '  <link rel="canonical" href="https://motapacalculator.com/">',
    '  <link rel="canonical" href="' + pageUrl + '">'
  );

  // <base href="/"> must come early in <head>, before any relative resource
  // reference, so relative paths (icon-512-maskable.png, articles/...) and
  // the site's own absolute paths (/app.js, /sw.js) both resolve against
  // whatever host actually serves the page (production, a CDN preview,
  // or localhost during testing) rather than being pinned to one domain.
  page = page.replace(
    '<meta charset="UTF-8">',
    '<meta charset="UTF-8">\n<base href="/">'
  );

  // Default-language bootstrap, right before the shared app script loads.
  page = page.replace(
    '<script src="/app.js"></script>',
    "<script>window.__MOTAPA_DEFAULT_LANG__ = '" + code + "';</script>\n<script src=\"/app.js\"></script>"
  );

  const outDir = path.join(ROOT, 'lang', code);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), page);
  generated++;
}

console.log('Generated', generated, 'per-language homepage files under /lang/<code>/index.html');
