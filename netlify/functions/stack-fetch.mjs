// lilStack detector.
// Fetches a page server-side and fingerprints its CMS, framework, hosting,
// backend, and marketing tech from response headers and HTML signatures.
// Detection runs here so the browser gets compact findings, not raw HTML.

const MAX_HOPS = 5;
const TIMEOUT_MS = 9000;
const MAX_BYTES = 700000;

function isBlockedHost(hostname) {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(obj),
});

/* ---------- detection ---------- */
function detect(html, headers, finalUrl) {
  const h = (name) => headers[name] || '';
  const found = [];
  const add = (cat, name, conf, why, version) => found.push({ cat, name, conf, why, version: version || null });

  const gen = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i) || [])[1] || '';

  /* ----- CMS & site builders ----- */
  if (/wp-content\/|wp-includes\/|\/wp-json\//i.test(html) || /wordpress/i.test(gen)) {
    const v = (gen.match(/WordPress\s+([\d.]+)/i) || [])[1];
    add('CMS & Site Builder', 'WordPress', 'high', v ? 'Meta generator states the version.' : 'wp-content and wp-includes asset paths.', v);
    const theme = (html.match(/wp-content\/themes\/([a-z0-9_-]+)/i) || [])[1];
    if (theme) add('CMS & Site Builder', `WordPress theme: ${theme}`, 'high', 'Theme folder visible in asset paths.');
    const plugins = [...new Set([...html.matchAll(/wp-content\/plugins\/([a-z0-9_-]+)/gi)].map((m) => m[1]))].slice(0, 6);
    if (plugins.length) add('CMS & Site Builder', `WordPress plugins: ${plugins.join(', ')}`, 'high', 'Plugin folders visible in asset paths.');
  }
  if (/squarespace/i.test(h('server')) || /static1?\.squarespace\.com|This is Squarespace/i.test(html) || /squarespace/i.test(gen)) {
    add('CMS & Site Builder', 'Squarespace', 'high', /squarespace/i.test(h('server')) ? 'Server header says Squarespace.' : 'Squarespace CDN assets in the page.');
  }
  if (/x-wix-/i.test(Object.keys(headers).join(' ')) || /static\.parastorage\.com|wixstatic\.com/i.test(html) || /wix\.com/i.test(gen)) {
    add('CMS & Site Builder', 'Wix', 'high', 'Wix headers or parastorage/wixstatic assets.');
  }
  if (/cdn\.shopify\.com|myshopify\.com/i.test(html) || headers['x-shopid'] || /shopify/i.test(h('powered-by') + h('x-powered-by'))) {
    add('CMS & Site Builder', 'Shopify', 'high', headers['x-shopid'] ? 'X-ShopId header present.' : 'Shopify CDN assets in the page.');
  }
  if (/assets(?:-global)?\.website-files\.com|data-wf-(?:domain|site|page)/i.test(html) || /webflow/i.test(gen)) {
    add('CMS & Site Builder', 'Webflow', 'high', 'website-files.com assets or data-wf attributes.');
  }
  if (/framerusercontent\.com/i.test(html) || /framer/i.test(gen)) add('CMS & Site Builder', 'Framer', 'high', 'Framer user content CDN in the page.');
  if (/ghost/i.test(gen) || /\/ghost\/assets\/|ghost-sdk/i.test(html)) {
    add('CMS & Site Builder', 'Ghost', 'high', /ghost/i.test(gen) ? 'Meta generator says Ghost.' : 'Ghost asset paths.', (gen.match(/Ghost\s+([\d.]+)/i) || [])[1]);
  }
  if (/drupal/i.test(h('x-generator')) || /drupal-settings-json|\/sites\/default\/files/i.test(html) || /drupal/i.test(gen)) {
    add('CMS & Site Builder', 'Drupal', 'high', 'Drupal generator header or default file paths.', (gen.match(/Drupal\s+([\d.]+)/i) || [])[1]);
  }
  if (/joomla/i.test(gen) || /\/media\/jui\//i.test(html)) add('CMS & Site Builder', 'Joomla', 'high', 'Joomla generator or media paths.');
  if (/irp\.cdn-website\.com|du-cdn|dudaone/i.test(html)) add('CMS & Site Builder', 'Duda', 'medium', 'Duda CDN asset patterns.');
  if (/img1\.wsimg\.com/i.test(html)) add('CMS & Site Builder', 'GoDaddy Website Builder', 'medium', 'wsimg.com asset host.');
  if (/weebly\.com\/uploads|weeblycloud/i.test(html)) add('CMS & Site Builder', 'Weebly', 'medium', 'Weebly asset paths.');
  if (/hs_cos_wrapper|cdn2\.hubspot\.net\/hub\//i.test(html)) add('CMS & Site Builder', 'HubSpot CMS', 'high', 'HubSpot COS markup in the page.');
  if (/carrd\.co\/assets|built with Carrd/i.test(html)) add('CMS & Site Builder', 'Carrd', 'medium', 'Carrd asset paths.');
  if (/blogger/i.test(gen) || /blogblog\.com|blogspot\.com\/feeds/i.test(html)) add('CMS & Site Builder', 'Blogger', 'high', 'Blogger generator or feed links.');

  /* ----- frameworks & static generators ----- */
  if (/astro/i.test(gen) || /<astro-island|data-astro-cid-/i.test(html)) {
    add('Framework', 'Astro', 'high', /astro/i.test(gen) ? 'Meta generator says Astro.' : 'astro-island markup.', (gen.match(/Astro\s+v?([\d.]+)/i) || [])[1]);
  }
  if (/__NEXT_DATA__|\/_next\/static/i.test(html) || /next\.js/i.test(h('x-powered-by'))) {
    add('Framework', 'Next.js', 'high', /__NEXT_DATA__/.test(html) ? '__NEXT_DATA__ payload in the page.' : '/_next/static asset paths.');
  }
  if (/__NUXT__|\/_nuxt\//i.test(html)) add('Framework', 'Nuxt', 'high', 'Nuxt asset paths or state payload.');
  if (/___gatsby|gatsby-chunk/i.test(html)) add('Framework', 'Gatsby', 'high', 'Gatsby root or chunk names.');
  if (/data-sveltekit|\/_app\/immutable\//i.test(html)) add('Framework', 'SvelteKit', 'high', 'SvelteKit attributes or immutable asset paths.');
  if (/__remixContext/i.test(html)) add('Framework', 'Remix', 'high', '__remixContext payload in the page.');
  if (/ng-version=["'][\d.]+/i.test(html)) add('Framework', 'Angular', 'high', 'ng-version attribute.', (html.match(/ng-version=["']([\d.]+)/i) || [])[1]);
  if (/eleventy/i.test(gen)) add('Framework', 'Eleventy', 'high', 'Meta generator says Eleventy.');
  if (/^hugo/i.test(gen)) add('Framework', 'Hugo', 'high', 'Meta generator says Hugo.', (gen.match(/Hugo\s+([\d.]+)/i) || [])[1]);
  if (/jekyll/i.test(gen)) add('Framework', 'Jekyll', 'high', 'Meta generator says Jekyll.', (gen.match(/Jekyll\s+v?([\d.]+)/i) || [])[1]);
  if (/docusaurus/i.test(gen) || /docusaurus/i.test(html.slice(0, 20000))) add('Framework', 'Docusaurus', 'medium', 'Docusaurus generator or markup.');
  if (!/__NEXT_DATA__|___gatsby|__remixContext/i.test(html) && /data-reactroot|id=["']root["'][^>]*><\/div>\s*<script/i.test(html)) {
    add('Framework', 'React (client-side app)', 'medium', 'React root mount point with an empty shell.');
  }

  /* ----- hosting & CDN ----- */
  const server = h('server');
  if (/netlify/i.test(server) || headers['x-nf-request-id']) add('Hosting & CDN', 'Netlify', 'high', 'Netlify server header or request id.');
  if (/vercel/i.test(server) || headers['x-vercel-id']) add('Hosting & CDN', 'Vercel', 'high', 'Vercel server header or request id.');
  if (/cloudflare/i.test(server) || headers['cf-ray']) add('Hosting & CDN', 'Cloudflare', 'high', 'cf-ray header present.');
  if (/github\.com/i.test(server)) add('Hosting & CDN', 'GitHub Pages', 'high', 'Server header says GitHub.com.');
  if (headers['x-amz-cf-id'] || /cloudfront/i.test(h('via'))) add('Hosting & CDN', 'AWS CloudFront', 'high', 'CloudFront identifiers in headers.');
  if (/amazons3/i.test(server)) add('Hosting & CDN', 'Amazon S3', 'high', 'Server header says AmazonS3.');
  if (headers['x-served-by'] && /cache-/i.test(headers['x-served-by'])) add('Hosting & CDN', 'Fastly', 'medium', 'Fastly-style x-served-by header.');
  if (/akamai/i.test(server) || headers['x-akamai-transformed']) add('Hosting & CDN', 'Akamai', 'medium', 'Akamai headers present.');
  if (headers['x-kinsta-cache']) add('Hosting & CDN', 'Kinsta', 'high', 'x-kinsta-cache header.');
  if (/wp engine/i.test(h('x-powered-by'))) add('Hosting & CDN', 'WP Engine', 'high', 'X-Powered-By says WP Engine.');
  if (/flywheel/i.test(server)) add('Hosting & CDN', 'Flywheel', 'high', 'Server header says Flywheel.');

  /* ----- backend ----- */
  if (/apache/i.test(server)) add('Backend', 'Apache', 'high', `Server header: ${server}`);
  else if (/nginx/i.test(server)) add('Backend', 'Nginx', 'high', `Server header: ${server}`);
  else if (/litespeed/i.test(server)) add('Backend', 'LiteSpeed', 'high', `Server header: ${server}`);
  else if (/microsoft-iis/i.test(server)) add('Backend', 'Microsoft IIS', 'high', `Server header: ${server}`);
  const xpb = h('x-powered-by');
  if (/php/i.test(xpb)) add('Backend', 'PHP', 'high', `X-Powered-By: ${xpb}`, (xpb.match(/php\/?([\d.]+)/i) || [])[1]);
  if (/asp\.net/i.test(xpb)) add('Backend', 'ASP.NET', 'high', `X-Powered-By: ${xpb}`);
  if (/express/i.test(xpb)) add('Backend', 'Express (Node.js)', 'high', `X-Powered-By: ${xpb}`);

  /* ----- analytics & marketing ----- */
  const mk = [
    [/googletagmanager\.com\/gtag\/js\?id=G-/i, 'Google Analytics 4', 'gtag.js loader for a G- property.'],
    [/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/, 'Google Tag Manager', 'GTM container snippet.'],
    [/connect\.facebook\.net\/[^"']+fbevents\.js/i, 'Meta Pixel', 'fbevents.js loader.'],
    [/clarity\.ms\/tag/i, 'Microsoft Clarity', 'Clarity tag.'],
    [/js\.hs-scripts\.com/i, 'HubSpot tracking', 'hs-scripts loader.'],
    [/static\.klaviyo\.com|klaviyo\.js/i, 'Klaviyo', 'Klaviyo script.'],
    [/plausible\.io\/js/i, 'Plausible', 'Plausible script.'],
    [/cdn\.usefathom\.com/i, 'Fathom Analytics', 'Fathom script.'],
    [/static\.hotjar\.com/i, 'Hotjar', 'Hotjar loader.'],
    [/widget\.intercom\.io|app\.intercom\.io/i, 'Intercom', 'Intercom widget.'],
    [/client\.crisp\.chat/i, 'Crisp chat', 'Crisp widget.'],
    [/embed\.tawk\.to/i, 'Tawk.to chat', 'Tawk widget.'],
    [/assets\.calendly\.com/i, 'Calendly', 'Calendly embed.'],
    [/chimpstatic\.com|list-manage\.com/i, 'Mailchimp', 'Mailchimp embed.'],
  ];
  for (const [re, name, why] of mk) if (re.test(html)) add('Analytics & Marketing', name, 'high', why);

  return found;
}

export const handler = async (event) => {
  const raw = (event.queryStringParameters && event.queryStringParameters.url || '').trim();
  if (!raw) return json(400, { error: 'Enter a URL to scan.' });
  const start = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;

  let u;
  try { u = new URL(start); } catch { return json(400, { error: 'That does not look like a valid URL.' }); }
  if (!/^https?:$/.test(u.protocol)) return json(400, { error: 'Only http and https URLs can be scanned.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let current = u.toString();
  let resp = null;

  try {
    for (let i = 0; i < MAX_HOPS; i++) {
      const host = (() => { try { return new URL(current).hostname; } catch { return ''; } })();
      if (isBlockedHost(host)) { clearTimeout(timer); return json(400, { error: 'For safety, local and private addresses cannot be scanned.' }); }
      let r;
      try {
        r = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 lilStack/1.0',
            accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          },
        });
      } catch (e) {
        clearTimeout(timer);
        if (e && e.name === 'AbortError') return json(504, { error: 'The page took too long to respond.' });
        return json(502, { error: 'Could not reach that URL. Check the link and try again.' });
      }
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        try { current = new URL(loc, current).toString(); } catch { current = loc; }
        continue;
      }
      resp = r;
      break;
    }
  } finally {
    clearTimeout(timer);
  }

  if (!resp) return json(502, { error: 'Too many redirects while loading that page.' });
  if (resp.status >= 400) return json(502, { error: `The page responded with HTTP ${resp.status}.` });

  const headers = {};
  resp.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  let html = '';
  try { html = (await resp.text()).slice(0, MAX_BYTES); } catch { html = ''; }

  const host = new URL(current).hostname;
  const [domain, dr] = await Promise.all([
    rdapLookup(host, controller.signal).catch(() => null),
    domainRating(host).catch(() => null),
  ]);

  return json(200, { url: current, status: resp.status, detections: detect(html, headers, current), domain, dr });
};

/* ---------- Ahrefs Domain Rating (free, no key) ---------- */
// Proxied server-side so the browser dodges CORS. Attribution is required and
// is rendered client-side; the license URL comes back in the payload.
async function domainRating(hostname) {
  const target = hostname.replace(/^www\./, '');
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 7000);
  try {
    const r = await fetch(
      `https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(target)}&output=json`,
      { signal: ac.signal, headers: { accept: 'application/json' } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const v = d && d.domain_rating && d.domain_rating.domain_rating;
    if (typeof v !== 'number') return null;
    return { value: Math.round(v * 10) / 10, license: (d.domain_rating && d.domain_rating.license) || null };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* ---------- domain registration (RDAP, the WHOIS successor) ---------- */
async function rdapLookup(hostname, signal) {
  const h = hostname.replace(/^www\./, '');
  // Try the full hostname first, then the registrable-looking tail, since
  // RDAP only answers for registered domains, not subdomains.
  const labels = h.split('.');
  const tries = [h];
  if (labels.length > 2) tries.push(labels.slice(-2).join('.'), labels.slice(-3).join('.'));
  for (const name of [...new Set(tries)]) {
    try {
      const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(name)}`, {
        signal,
        headers: { accept: 'application/rdap+json, application/json' },
      });
      if (!r.ok) continue;
      const d = await r.json();
      const ev = (action) => {
        const e = (d.events || []).find((x) => x.eventAction === action);
        return e ? e.eventDate : null;
      };
      let registrar = null;
      for (const ent of d.entities || []) {
        if ((ent.roles || []).includes('registrar')) {
          const fn = (ent.vcardArray && ent.vcardArray[1] || []).find((v) => v[0] === 'fn');
          registrar = fn ? fn[3] : ent.handle || null;
          break;
        }
      }
      return { name: d.ldhName ? d.ldhName.toLowerCase() : name, registrar, created: ev('registration'), expires: ev('expiration'), updated: ev('last changed') };
    } catch (e) { /* try next */ }
  }
  return null;
}
