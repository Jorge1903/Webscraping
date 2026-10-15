import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Check, Maximize2, RotateCcw } from 'lucide-react';

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
  const [field, setField] = useState('price');
  const [candidate, setCandidate] = useState(null);
  const [ready, setReady] = useState(0);
  const [hover, setHover] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { setCandidate(null); setLoading(true); setError(''); }, [url]);

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
    document.addEventListener('mouseover', over);
    document.addEventListener('click', click, true);
    document.addEventListener('submit', prevent, true);
    return () => {
      highlighted?.removeAttribute('data-monitor-hover');
      document.removeEventListener('mouseover', over);
      document.removeEventListener('click', click, true);
      document.removeEventListener('submit', prevent, true);
    };
  }, [ready, field, loading]);

  function confirm() {
    onSelect(field, candidate.selector, candidate.value);
    setCandidate(null);
    const next = fields.find(([key]) => key !== field && !selectors[key]);
    if (next) setField(next[0]);
  }

  return <section className={`inspector ${expanded ? 'inspector-expanded' : ''}`}>
    <div className="inspector-header">
      <div><span className="eyebrow">Selector visual</span><h3><Crosshair size={20} /> Ajusta una selección</h3></div>
      <button type="button" className="secondary-button" onClick={() => setExpanded(!expanded)}><Maximize2 size={16} />{expanded ? 'Reducir' : 'Ampliar'}</button>
    </div>
    <div className="inspector-layout">
      <div className="inspector-browser">
        <div className="inspector-address"><span className="live-dot" />{url}</div>
        {loading && <div className="inspector-loading">Abriendo la página para seleccionar…</div>}
        <iframe ref={frame} title="Seleccionar información de la página" src={`/api/page-preview?url=${encodeURIComponent(url)}`} sandbox="allow-same-origin" onLoad={() => { setLoading(false); setReady(value => value + 1); }} />
        <div className="inspector-hover">{hover || 'Pasa el cursor sobre una parte de la página para resaltarla.'}</div>
      </div>
      <aside className="inspector-sidebar">
        <strong>Datos del producto</strong>
        <p>Los datos reconocidos ya están marcados. Puedes desmarcarlos o elegir otro elemento de la página.</p>
        <div className="inspector-fields">{fields.map(([key, label]) => <div className="inspector-field" key={key}>
          {onToggle && <input type="checkbox" aria-label={`Incluir ${label.toLowerCase()}`} checked={selectedFields.includes(key)} onChange={() => onToggle(key)} />}
          <button type="button" className={field === key ? 'active' : ''} onClick={() => { setField(key); setCandidate(null); setError(''); }}>
            <span>{label}<small className="inspector-field-value">{detected?.[key] && !/no detectado/i.test(detected[key]) ? String(detected[key]).replace('https://schema.org/', '') : 'Elegir en la página'}</small></span>{selectedFields.includes(key) ? <Check size={16} /> : <Crosshair size={15} />}
          </button>
          {selectors[key] && <button type="button" className="reset-selection" aria-label={`Restablecer ${label} a detección automática`} onClick={() => onSelect(key, '', '')}><RotateCcw size={14} /></button>}
        </div>)}</div>
        <div className="isolated-selection" aria-live="polite">
          <span className="eyebrow">Selección aislada · {fields.find(([key]) => key === field)?.[1]}</span>
          {candidate ? <>{field === 'image' ? <img src={candidate.value} alt="Imagen seleccionada" /> : <strong>{candidate.value}</strong>}<button type="button" className="primary-button" onClick={confirm}>Usar como {fields.find(([key]) => key === field)?.[1].toLowerCase()}</button></> : detected?.[field] && !/no detectado/i.test(detected[field]) ? <>{field === 'image' ? <img src={detected[field]} alt="Imagen reconocida en la página" /> : <strong>{detected[field]}</strong>}<p>{selectors[field] ? 'Selección guardada.' : 'Reconocido automáticamente.'} Haz clic en otro elemento si quieres cambiarlo.</p></> : <p>Haz clic en esta información dentro de la página.</p>}
        </div>
        {error && <div className="alert slim">{error}</div>}
        <p className="hint">Los datos sin selección usan detección automática. La vista muestra el HTML disponible; algunas tiendas requieren JavaScript o bloquean el acceso.</p>
      </aside>
    </div>
  </section>;
}
