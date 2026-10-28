// The Pages test build's Android download page, /android/ (D-058): how to install the test APK,
// its version and size, in English, Afrikaans, German and Dutch (src/i18n/android/). Pure, so it
// is unit-tested; tools/android-page.ts writes it into dist/android/ in the Pages workflow.

export type AndroidPageTables = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface AndroidPageInput {
  readonly version: string;
  /** The APK's size, or null when CI built no APK (the page then says so, with no link). */
  readonly apkBytes: number | null;
  /** language → (key → text), English first. */
  readonly tables: AndroidPageTables;
}

/** The APK's file name next to the page. */
export const APK_FILE = 'tarantal-madness.apk';

/** MB with one decimal, as the page shows it. */
export function sizeMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One language's texts with {version} and {size} filled in. */
export function pageTexts(
  table: Readonly<Record<string, string>>,
  version: string,
  apkBytes: number | null,
): Record<string, string> {
  const size = apkBytes === null ? '?' : sizeMb(apkBytes);
  return Object.fromEntries(
    Object.entries(table).map(([k, v]) => [
      k,
      v.replace(/\{version\}/g, version).replace(/\{size\}/g, size),
    ]),
  );
}

export function androidPageHtml(i: AndroidPageInput): string {
  const langs = Object.keys(i.tables);
  const texts = Object.fromEntries(
    langs.map((l) => [l, pageTexts(i.tables[l] ?? {}, i.version, i.apkBytes)]),
  );
  const en = texts['en'] ?? {};
  const t = (k: string): string => escapeHtml(en[`android.${k}`] ?? k);
  const has = i.apkBytes !== null;
  // The page is static HTML in English; a few lines of script switch the texts to the phone's
  // language (or ?lang=xx). JSON in a <script> block: `<` is escaped so no text closes it.
  const data = JSON.stringify(texts).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t('title')}</title>
<style>
:root { color-scheme: dark; --bg: #1b1410; --fg: #f3ead3; --muted: #c9b99a; --accent: #e8a452; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.5 system-ui, sans-serif; }
main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.6em; margin: 0 0 4px; }
.note { color: var(--muted); margin: 0 0 20px; }
.btn { display: inline-block; background: var(--accent); color: #1b1410; font-weight: 700;
  padding: 14px 22px; border-radius: 12px; text-decoration: none; margin: 8px 0 4px; }
.missing { background: #3a2a1e; padding: 12px 16px; border-radius: 10px; }
ol { padding-left: 1.3em; } li { margin: 6px 0; }
nav { margin-top: 28px; color: var(--muted); }
nav a, a { color: var(--accent); }
.langs { margin-bottom: 16px; } .langs a { margin-right: 10px; }
</style>
</head>
<body>
<main>
<div class="langs">${langs.map((l) => `<a href="?lang=${l}">${l.toUpperCase()}</a>`).join('')}</div>
<h1 data-k="title">${t('title')}</h1>
<p class="note" data-k="test_build">${t('test_build')}</p>
${
  has
    ? `<p data-k="version">${t('version')}</p>
<p><a class="btn" href="${APK_FILE}" download data-k="download">${t('download')}</a></p>`
    : `<p class="missing" data-k="missing">${t('missing')}</p>`
}
<h2 data-k="how">${t('how')}</h2>
<ol>
<li data-k="step1">${t('step1')}</li>
<li data-k="step2">${t('step2')}</li>
<li data-k="step3">${t('step3')}</li>
<li data-k="step4">${t('step4')}</li>
</ol>
<p data-k="update">${t('update')}</p>
<p class="note" data-k="iphone">${t('iphone')}</p>
<nav><span data-k="play_web">${t('play_web')}</span> <a href="../">Tarantal Madness</a></nav>
</main>
<script>
(function () {
  var texts = ${data};
  var want = new URLSearchParams(location.search).get('lang');
  var prefs = want ? [want] : (navigator.languages || [navigator.language || 'en']);
  var lang = 'en';
  for (var i = 0; i < prefs.length; i++) {
    var l = String(prefs[i]).slice(0, 2).toLowerCase();
    if (texts[l]) { lang = l; break; }
  }
  var table = texts[lang];
  document.documentElement.lang = lang;
  document.title = table['android.title'];
  document.querySelectorAll('[data-k]').forEach(function (el) {
    var v = table['android.' + el.getAttribute('data-k')];
    if (v) el.textContent = v;
  });
})();
</script>
</body>
</html>
`;
}
