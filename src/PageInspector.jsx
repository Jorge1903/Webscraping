import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, Check, Maximize2, RotateCcw } from 'lucide-react';
import { usePagePreview } from './use-page-preview.js';

const fields = [['price', 'Precio'], ['name', 'Nombre'], ['image', 'Imagen'], ['availability', 'Disponibilidad'], ['description', 'Descripción'], ['currency', 'Moneda']];

function selectorFor(element, document) {
  const parts = [];
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const tag = node.localName;
    const siblings = node.parentElement ? [...node.parentElement.children].filter(child => child.localName === tag) : [node];
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
    if (tag === 'body') break;
  }
  return parts.join(' > ');
}

export default function PageInspector({ url, selectors, onSelect, detected, selectedFields = [], onToggle }) {
  const frame = useRef(null);
  const viewport = useRef(null);
  const panel = useRef(null);
  const expandButton = useRef(null);
  const headingId = useId();
  const [field, setField] = useState('price');
  const [candidate, setCandidate] = useState(null);
  const [ready, setReady] = useState(0);
  const [hover, setHover] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewMode, setPreviewMode] = useState('responsive');
  const [viewportWidth, setViewportWidth] = useState(0);
  const preview = usePagePreview(url);
  useEffect(() => { setCandidate(null); setLoading(true); setError(''); }, [url]);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => setViewportWidth(entries[0].contentRect.width));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    expandButton.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') setExpanded(false);
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button, input, select, iframe')].filter(element => element.getClientRects().length && !element.disabled);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      requestAnimationFrame(() => expandButton.current?.focus());
    };
  }, [expanded]);

  function chooseField(key) {
    setField(key); setCandidate(null); setError('');
  }

  useEffect(() => {
    const document = frame.current?.contentDocument;
    if (!document || loading) return;
    const selector = selectors[field] || detected?.detectedSelectors?.[field];
    let target;
    try { target = selector && document.querySelector(selector); } catch { /* Fall back to the product heading. */ }
    if (!target?.getClientRects().length) target = document.querySelector('h1');
    const scroll = document.scrollingElement;
    if (target && scroll) scroll.scrollTop = Math.max(0, target.getBoundingClientRect().top + scroll.scrollTop - 24);
  }, [ready, loading, field, detected, selectors]);

  useEffect(() => {
    const document = frame.current?.contentDocument;
    if (!document || loading) return;
    document.querySelectorAll('[data-monitor-auto]').forEach(node => node.removeAttribute('data-monitor-auto'));
    fields.forEach(([key]) => {
      if (!selectedFields.includes(key)) return;
      const selector = selectors[key] || detected?.detectedSelectors?.[key];
      if (!selector) return;
      try { document.querySelector(selector)?.setAttribute('data-monitor-auto', key); } catch { /* Invalid manual selectors are reported by the API. */ }
    });
  }, [ready, loading, selectors, detected, selectedFields]);

  useEffect(() => {
    const document = frame.current?.contentDocument;
    if (!document || loading) return;
    let highlighted;
    const over = event => {
      if (['html', 'body'].includes(event.target.localName)) return;
      highlighted?.removeAttribute('data-monitor-hover');
      highlighted = event.target;
      highlighted.setAttribute('data-monitor-hover', '');
      setHover(highlighted.localName + (highlighted.id ? `#${highlighted.id}` : '') + ' · ' + (highlighted.textContent || highlighted.getAttribute('alt') || '').trim().slice(0, 100));
    };
    const click = event => {
      event.preventDefault(); event.stopPropagation();
      const element = event.target;
      if (['html', 'body'].includes(element.localName)) return;
      if (field === 'image' && element.localName !== 'img') {
        setError('Selecciona directamente una imagen de la página.'); return;
      }
      const value = field === 'image' ? element.getAttribute('src') || element.getAttribute('data-src') : element.textContent?.replace(/\s+/g, ' ').trim();
      if (!value) { setError('Esta parte no contiene un valor. Elige otra.'); return; }
      document.querySelectorAll('[data-monitor-selected]').forEach(node => node.removeAttribute('data-monitor-selected'));
      element.setAttribute('data-monitor-selected', '');
      setCandidate({ selector: selectorFor(element, document), value: field === 'image' ? new URL(value, document.baseURI).href : value });
      setError('');
    };
    const prevent = event => event.preventDefault();
    const escape = event => { if (event.key === 'Escape' && expanded) setExpanded(false); };
    document.addEventListener('mouseover', over);
    document.addEventListener('click', click, true);
    document.addEventListener('submit', prevent, true);
    document.addEventListener('keydown', escape);
    return () => {
      highlighted?.removeAttribute('data-monitor-hover');
      document.removeEventListener('mouseover', over);
      document.removeEventListener('click', click, true);
      document.removeEventListener('submit', prevent, true);
      document.removeEventListener('keydown', escape);
    };
  }, [ready, field, loading, expanded]);

  function confirm() {
    onSelect(field, candidate.selector, candidate.value);
    setCandidate(null);
    const next = fields.find(([key]) => key !== field && !selectors[key]);
    if (next) setField(next[0]);
  }

  const scale = previewMode === 'desktop' && viewportWidth ? Math.min(1, viewportWidth / 1120) : 1;
  const content = <section ref={panel} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-labelledby={headingId} className={`inspector ${expanded ? 'inspector-expanded' : ''}`}>
    <div className="inspector-header">
      <div><span className="eyebrow">Selector visual</span><h3 id={headingId}><Crosshair size={20} /> Ajusta una selección</h3></div>
      <button ref={expandButton} type="button" className="secondary-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Maximize2 size={16} />{expanded ? 'Cerrar' : 'Ampliar'}</button>
    </div>
    <div className="mobile-field-controls">
      <label>Dato a seleccionar<select aria-label="Dato a seleccionar" value={field} onChange={event => chooseField(event.target.value)}>{fields.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {onToggle && <label className="include-field"><input type="checkbox" aria-label={`Incluir ${fields.find(([key]) => key === field)?.[1].toLowerCase()} en el monitoreo`} checked={selectedFields.includes(field)} onChange={() => onToggle(field)} /><span>Incluir</span></label>}
    </div>
    <div className="inspector-layout">
      <div className="inspector-browser">
        <div className="inspector-address"><span className="live-dot" />{url}</div>
        <div className="preview-tools"><label>Vista<select aria-label="Vista de la página" value={previewMode} onChange={event => setPreviewMode(event.target.value)}><option value="responsive">Adaptada a la pantalla</option><option value="desktop">Página completa</option></select></label><span>Toca o haz clic en un dato para seleccionarlo.</span></div>
        <div ref={viewport} className="inspector-preview-viewport">
          {preview.loading && <div className="inspector-loading" role="status">Abriendo la página… El servidor gratuito puede tardar en iniciar.</div>}
          {preview.error && <div className="preview-error" role="alert"><p>{preview.error}</p><button type="button" className="secondary-button" onClick={preview.retry}>Volver a cargar</button></div>}
          {preview.html && <iframe ref={frame} title="Seleccionar información de la página" style={previewMode === 'desktop' ? { width: Math.max(1120, viewportWidth), height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined} srcDoc={preview.html} sandbox="allow-same-origin" onLoad={() => { setLoading(false); setReady(value => value + 1); }} />}
        </div>
        <div className="inspector-hover">{hover || 'Desliza para explorar; toca un elemento para ver su valor.'}</div>
      </div>
      <aside className="inspector-sidebar">
        <strong className="inspector-intro">Datos del producto</strong>
        <p className="inspector-intro">Los datos reconocidos ya están marcados. Puedes desmarcarlos o elegir otro elemento de la página.</p>
        <div className="inspector-fields">{fields.map(([key, label]) => <div className="inspector-field" key={key}>
          {onToggle && <input type="checkbox" aria-label={`Incluir ${label.toLowerCase()}`} checked={selectedFields.includes(key)} onChange={() => onToggle(key)} />}
          <button type="button" className={field === key ? 'active' : ''} onClick={() => chooseField(key)}>
            <span>{label}<small className="inspector-field-value">{detected?.[key] && !/no detectado/i.test(detected[key]) ? String(detected[key]).replace('https://schema.org/', '') : 'Elegir en la página'}</small></span>{selectedFields.includes(key) ? <Check size={16} /> : <Crosshair size={15} />}
          </button>
          {selectors[key] && <button type="button" className="reset-selection" aria-label={`Restablecer ${label} a detección automática`} onClick={() => onSelect(key, '', '')}><RotateCcw size={14} /></button>}
        </div>)}</div>
        <div className="isolated-selection" aria-live="polite">
          <span className="eyebrow">Selección aislada · {fields.find(([key]) => key === field)?.[1]}</span>
          {candidate ? <>{field === 'image' ? <img src={candidate.value} alt="Imagen seleccionada" /> : <strong>{candidate.value}</strong>}<button type="button" className="primary-button" onClick={confirm}>Usar como {fields.find(([key]) => key === field)?.[1].toLowerCase()}</button></> : detected?.[field] && !/no detectado/i.test(detected[field]) ? <>{field === 'image' ? <img src={detected[field]} alt="Imagen reconocida en la página" /> : <strong>{detected[field]}</strong>}<p>{selectors[field] ? 'Selección guardada.' : 'Reconocido automáticamente.'} Haz clic en otro elemento si quieres cambiarlo.</p></> : <p>Haz clic en esta información dentro de la página.</p>}
        </div>
        {error && <div className="alert slim">{error}</div>}
        <p className="hint inspector-help">Los datos sin selección usan detección automática. La vista muestra el HTML disponible; algunas tiendas requieren JavaScript o bloquean el acceso.</p>
      </aside>
    </div>
  </section>;
  return expanded ? createPortal(content, document.body) : content;
}
