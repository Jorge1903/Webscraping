import { load } from 'cheerio';

export const selectableFields = ['name', 'price', 'image', 'availability', 'description', 'currency'];

export function htmlText(value) { return load(String(value || ''), null, false).root().text(); }

export function recognizeFields(html, url) {
  const $ = load(html);
  const candidates = {
    name: ['[itemprop="name"]', '#product-name', '#productTitle', 'main h1', 'h1'],
    price: ['[itemprop="price"]', '#product-price', '#priceblock_ourprice', '.a-price .a-offscreen', '[data-testid="price"]', '.product-price', '.price', '#price'],
    image: ['[itemprop="image"]', '#landingImage', '.product-image img', 'main img'],
    currency: ['[itemprop="priceCurrency"]', '#currency', '.currency'],
    availability: ['[itemprop="availability"]', '#availability', '.availability', '.stock'],
    description: ['[itemprop="description"]', '#product-description', '.product-description', 'main .description']
  };
  const selectors = {};
  for (const key of selectableFields) {
    for (const selector of candidates[key]) {
      const element = $(selector).first();
      if (!element.length) continue;
      if (key === 'price' && !/\d/.test(element.text() || element.attr('content') || '')) continue;
      selectors[key] = selector;
      break;
    }
  }
  const values = {};
  for (const [key, selector] of Object.entries(selectors)) {
    try { values[key] = selectedValues(html, { [key]: selector }, url, $)[key]; }
    catch { delete selectors[key]; }
  }
  return { selectors, values };
}

export function normalizeSelectors(input = {}) {
  return Object.fromEntries(selectableFields.map(key => {
    const selector = String(input[key] || '').trim();
    if (selector.length > 1000) throw new Error('La selección es demasiado larga. Selecciona una parte más específica.');
    return [key, selector];
  }));
}

export function selectedValues(html, selectors, url, document) {
  const $ = document || load(html);
  return Object.fromEntries(selectableFields.map(key => {
    if (!selectors?.[key]) return [key, ''];
    let element;
    try { element = $(selectors[key]).first(); }
    catch { throw new Error(`La selección de ${key} no es válida. Vuelve a elegirla.`); }
    if (!element.length) throw new Error(`La parte seleccionada para ${key} ya no existe en la página. Vuelve a seleccionarla.`);
    const value = key === 'image'
      ? element.attr('src') || element.attr('data-src') || element.attr('content') || ''
      : element.text() || element.attr('content') || element.attr('value') || '';
    if (!value.trim()) throw new Error(`La parte seleccionada para ${key} está vacía.`);
    return [key, key === 'image' ? new URL(value, url).href : value.replace(/\s+/g, ' ').trim()];
  }));
}

export function safePreview(html, sourceUrl) {
  const $ = load(html);
  $('script, noscript, iframe, object, embed, base, meta[http-equiv], link[rel="import"]').remove();
  $('*').each((_, element) => {
    for (const [name, value] of Object.entries(element.attribs || {})) {
      if (/^on/i.test(name) || ['srcdoc', 'action', 'formaction', 'target', 'download'].includes(name.toLowerCase()) || /^\s*(javascript|vbscript):/i.test(value)) $(element).removeAttr(name);
    }
  });
  $('head').prepend($('<base>').attr('href', sourceUrl));
  $('meta[name="viewport" i]').remove();
  $('head').append('<meta name="viewport" content="width=device-width, initial-scale=1">');
  $('head').append('<style>html{width:100%;}body{margin-inline:0;}img,video,picture{max-width:100%;height:auto;}input,select,textarea{max-width:100%;}*{box-sizing:border-box;}</style>');
  // Reflow desktop-only shop grids inside narrow frames without removing nodes:
  // the CSS selectors selected by the user must still match the source HTML.
  $('head').append(`<style data-monitor-mobile>
    @media(max-width:600px){
      html,body{width:100%!important;min-width:0!important;max-width:100%!important;}
      body{padding:12px!important;overflow-wrap:anywhere!important;}
      body *{min-width:0!important;max-width:100%!important;box-sizing:border-box!important;}
      main,section,article,form,div[class],ul[class]{grid-template-columns:minmax(0,1fr)!important;flex-wrap:wrap!important;}
      [class*="stretchChildrenWidth"],.product__media-wrapper,.product__info-wrapper,.row>[class*="col-"]{width:100%!important;flex-basis:100%!important;max-width:100%!important;}
      h1{font-size:clamp(20px,6vw,28px)!important;line-height:1.25!important;word-break:normal!important;}
      h2,h3{font-size:clamp(18px,5vw,24px)!important;line-height:1.3!important;}
      img,video,picture{height:auto!important;object-fit:contain!important;}
      table{display:block!important;overflow-x:auto!important;}
      [style*="position: fixed"],[style*="position:fixed"]{position:static!important;}
    }
  </style>`);
  $('head').append(`<style>html{color-scheme:dark}html,body{min-height:100%;background:#0d121c!important;color:#e6edf6!important;}body{overflow:auto!important;}body *:not(img):not(svg):not(svg *){background-color:transparent!important;color:inherit!important;border-color:#2b3546!important;}*{cursor:crosshair!important;scrollbar-color:#3b4b63 #101723;}[data-monitor-auto]{outline:2px solid #47c9ae!important;outline-offset:2px!important;}[data-monitor-hover]{outline:3px solid #94a7ff!important;outline-offset:2px!important;background-color:rgba(148,167,255,.12)!important;}[data-monitor-selected]{outline:3px solid #a9b7ff!important;outline-offset:2px!important;}</style>`);
  return $.html();
}
