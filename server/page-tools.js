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
    try { values[key] = selectedValues(html, { [key]: selector }, url)[key]; }
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

export function selectedValues(html, selectors, url) {
  const $ = load(html);
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
  $('head').append(`<style>html{color-scheme:dark}html,body{min-height:100%;background:#0d121c!important;color:#e6edf6!important;}body{overflow:auto!important;}body *:not(img):not(svg):not(svg *){background-color:transparent!important;color:inherit!important;border-color:#2b3546!important;}*{cursor:crosshair!important;scrollbar-color:#3b4b63 #101723;}[data-monitor-auto]{outline:2px solid #47c9ae!important;outline-offset:2px!important;}[data-monitor-hover]{outline:3px solid #94a7ff!important;outline-offset:2px!important;background-color:rgba(148,167,255,.12)!important;}[data-monitor-selected]{outline:3px solid #a9b7ff!important;outline-offset:2px!important;}</style>`);
  return $.html();
}
