// lilStack: scan a site via the /stack-fetch Netlify function and render its
// detected CMS, framework, hosting, backend, and marketing tech.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- theme (OS-aware, matches the family) ---------- */
const MOON_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
const SUN_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4l1.4-1.4M18 6l1.4-1.4"/></g></svg>';

function setThemeIcon(btn, theme) {
  if (theme === 'dark') { btn.innerHTML = SUN_SVG; btn.setAttribute('aria-label', 'Switch to light mode'); }
  else { btn.innerHTML = MOON_SVG; btn.setAttribute('aria-label', 'Switch to dark mode'); }
}
function initTheme() {
  const btn = $('#ui-theme-btn');
  const current = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  setThemeIcon(btn, current());
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('lilstack-theme', next); } catch (e) {}
    setThemeIcon(btn, next);
  });
}

/* ---------- render ---------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CATEGORY_ORDER = ['CMS & Site Builder', 'Framework', 'Hosting & CDN', 'Backend', 'Analytics & Marketing'];

const CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function detCard(d) {
  const ver = d.version ? ` <span class="ver">v${esc(d.version)}</span>` : '';
  const conf = d.conf === 'high' ? '' : '<span class="conf">likely</span>';
  return `<div class="check check--ok">
    <span class="check-ic">${CHECK_SVG}</span>
    <div class="check-body">
      <div class="check-t">${esc(d.name)}${ver} ${conf}</div>
      <div class="check-m">${esc(d.why)}</div>
    </div>
  </div>`;
}

function note(kind, msg) {
  return `<div class="t-note t-note--${kind}">${esc(msg)}</div>`;
}

function headline(domain, dets) {
  const cms = dets.find((d) => d.cat === 'CMS & Site Builder');
  const fw = dets.find((d) => d.cat === 'Framework');
  const host = dets.find((d) => d.cat === 'Hosting & CDN');
  const main = cms ? cms.name : fw ? fw.name : null;
  if (main && host) return `${domain} runs on ${main}, hosted via ${host.name}.`;
  if (main) return `${domain} runs on ${main}.`;
  if (host) return `${domain} is served via ${host.name}; the platform keeps a low profile.`;
  return `${domain} keeps its stack quiet. No common fingerprints found.`;
}

function setLoading(target) {
  $('#results').innerHTML = `<div class="t-loading"><span class="spin" aria-hidden="true"></span> Fingerprinting ${esc(target)}&hellip;</div>`;
}

/* ---------- run ---------- */
async function run() {
  const raw = $('#f-url').value.trim();
  if (!raw) { $('#f-url').focus(); return; }
  const btn = $('#check-btn');
  btn.disabled = true;
  setLoading(raw);
  try {
    const res = await fetch('/.netlify/functions/stack-fetch?url=' + encodeURIComponent(raw), { headers: { accept: 'application/json' } });
    const d = await res.json();
    if (d.error) { $('#results').innerHTML = note('err', d.error); return; }
    const domain = (() => { try { return new URL(d.url).hostname.replace(/^www\./, ''); } catch { return raw; } })();
    const dets = d.detections || [];

    let html = `<div class="t-head"><div class="t-summary">${esc(headline(domain, dets))}</div>` +
      `<span class="pill pill--ok">${dets.length} found</span></div>`;

    if (!dets.length) {
      html += note('warn', 'Nothing recognizable surfaced from the homepage. The site may be custom-built, heavily cached, or hiding its fingerprints, which is its own kind of flex.');
    } else {
      for (const cat of CATEGORY_ORDER) {
        const items = dets.filter((x) => x.cat === cat);
        if (!items.length) continue;
        html += `<div class="dsec"><div class="dsec-h">${esc(cat)}</div>${items.map(detCard).join('')}</div>`;
      }
    }
    $('#results').innerHTML = html;
  } catch (e) {
    $('#results').innerHTML = note('err', 'Could not reach the scanner. If you are running locally without Netlify, the scan function is unavailable.');
  } finally {
    btn.disabled = false;
  }
}

function initStack() {
  initTheme();
  $('#check-form').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $$('.ex').forEach((b) => b.addEventListener('click', () => { $('#f-url').value = b.dataset.ex; run(); }));
}

export { initStack };
