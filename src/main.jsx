import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Camera,
  CheckCircle2,
  Clock3,
  BellRing,
  ExternalLink,
  Loader2,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  UserRound,
  Wifi
} from "lucide-react";
import "./styles.css";
import PageInspector from "./PageInspector.jsx";
import { fieldRecognized, recognizedSelection } from "./field-selection.js";

const intervalOptions = [5];

const fieldOptions = [
  { key: "pagePreview", label: "Vista de página", previewKey: "sourceUrl" },
  { key: "image", label: "Imagen", previewKey: "image" },
  { key: "name", label: "Nombre", previewKey: "name" },
  { key: "price", label: "Precio", previewKey: "price" },
  { key: "currency", label: "Moneda", previewKey: "currency" },
  { key: "availability", label: "Disponibilidad", previewKey: "availability" },
  { key: "description", label: "Descripción", previewKey: "description" },
  { key: "checkedAt", label: "Fecha de revisión", previewKey: "checkedAt" },
  { key: "sourceUrl", label: "Enlace de origen", previewKey: "sourceUrl" },
  { key: "history", label: "Historial y gráfica", previewKey: "price" }
];

const defaultVisibleFields = ["pagePreview", "image", "name", "price", "currency", "availability", "description", "checkedAt", "history"];

const emptyJob = {
  title: "",
  url: "",
  intervalMinutes: 5,
  mode: "html",
  targetPrice: "",
  visibleFields: defaultVisibleFields,
  selectors: {
    name: "",
    price: "",
    image: ""
  },
  active: true
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la solicitud.");
  return payload;
}

function formatDate(value) {
  if (!value) return "Pendiente";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function priceNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value || "").match(/[\d.,]+/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value, currency = "MXN") {
  if (value == null) return "N/D";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatShortDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDuration(ms) {
  if (ms <= 0) return "Ahora";
  const totalMinutes = Math.ceil(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function getNextRun(job) {
  if (!job?.active) return null;
  if (!job.lastRunAt) return new Date();
  return new Date(new Date(job.lastRunAt).getTime() + job.intervalMinutes * 60 * 1000);
}

function formatFieldValue(key, value) {
  if (!value) return "Sin detectar";
  if (key === "checkedAt") return formatDate(value);
  if (key === "availability") return String(value).replace(/^https?:\/\/schema.org\//, "");
  return String(value);
}

function getPricePoints(results = []) {
  return results
    .filter((result) => result.status === "ok")
    .map((result) => ({
      id: result.id,
      date: result.createdAt,
      value: result.data.priceValue ?? priceNumber(result.data.price)
    }))
    .filter((point) => point.value != null)
    .reverse();
}

function PriceHistoryChart({ points, currency }) {
  const latest = points.at(-1);
  const previous = points.at(-2);
  const delta = latest && previous ? latest.value - previous.value : 0;
  const deltaLabel = latest && previous ? `${delta > 0 ? "+" : ""}${formatMoney(delta, currency)}` : "Primera lectura";

  if (!points.length) {
    return (
      <div className="history-chart chart-empty">
        <strong>Historial de precios</strong>
        <span>Se dibujará cuando la primera revisión detecte un precio.</span>
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className="history-chart single-point">
        <div className="chart-heading">
          <div>
            <span className="eyebrow">Historial de precios</span>
            <strong>{formatMoney(latest.value, currency)}</strong>
          </div>
          <span>1 punto</span>
        </div>
        <div className="single-price-line">
          <span>{formatShortDate(latest.date)}</span>
          <b>{formatMoney(latest.value, currency)}</b>
        </div>
      </div>
    );
  }

  const width = 640;
  const height = 230;
  const padding = { top: 20, right: 24, bottom: 34, left: 62 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const paddingValue = Math.max((max - min) * 0.12, max * 0.02, 1);
  const chartMin = Math.max(0, min - paddingValue);
  const chartMax = max + paddingValue;
  const range = chartMax - chartMin || 1;
  const coords = points.map((point, index) => {
    const x = padding.left + (index / (points.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((point.value - chartMin) / range) * chartHeight;
    return { ...point, x, y };
  });
  const linePoints = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = `${padding.left},${padding.top + chartHeight} ${linePoints} ${padding.left + chartWidth},${padding.top + chartHeight}`;
  const ticks = [chartMax, (chartMax + chartMin) / 2, chartMin];
  const firstDate = formatShortDate(points[0].date);
  const lastDate = formatShortDate(latest.date);

  return (
    <div className="history-chart">
      <div className="chart-heading">
        <div>
          <span className="eyebrow">Historial de precios</span>
          <strong>{formatMoney(latest.value, currency)}</strong>
        </div>
        <span className={delta < 0 ? "delta down" : delta > 0 ? "delta up" : "delta"}>
          {deltaLabel}
        </span>
      </div>
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfica de historial de precio">
        {ticks.map((tick) => {
          const y = padding.top + chartHeight - ((tick - chartMin) / range) * chartHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} />
              <text x={padding.left - 10} y={y + 4} textAnchor="end">{formatMoney(tick, currency)}</text>
            </g>
          );
        })}
        <polygon points={areaPoints} />
        <polyline points={linePoints} />
        {coords.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="4.5" />
            <title>{`${formatShortDate(point.date)} - ${formatMoney(point.value, currency)}`}</title>
          </g>
        ))}
        <text x={padding.left} y={height - 8}>{firstDate}</text>
        <text x={padding.left + chartWidth} y={height - 8} textAnchor="end">{lastDate}</text>
      </svg>
    </div>
  );
}

function ProductPagePreview({ url, title }) {
  const previewUrl = `/api/page-preview?url=${encodeURIComponent(url)}`;

  return (
    <div className="page-preview-card">
      <div className="page-preview-toolbar">
        <span />
        <span />
        <span />
        <b>{title || "Producto"}</b>
      </div>
      <div className="page-preview-viewport">
        <iframe
          title={`Vista de ${title || url}`}
          src={previewUrl}
          loading="lazy"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("demo@local.test");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = await api(`/api/${mode}`, { method: "POST", body: { email, password } });
      onAuth(payload.user);
    } catch (err) {
      if (mode === "register" && err.message === "Ese correo ya existe.") {
        setMode("login");
        setError("Ese correo ya existe. Cambié a iniciar sesión para que puedas entrar con esa cuenta.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">
          <Wifi size={22} />
        </div>
        <h1>Scraping Monitor</h1>
        <p>Sigue tus productos, descubre cambios de precio y conserva cada revisión.</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Correo
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </label>
          <label>
            Contraseña
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} autoComplete="current-password" required />
          </label>
          {error && <div className="alert">{error}</div>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <UserRound size={18} />}
            {mode === "register" ? "Crear cuenta" : "Entrar"}
          </button>
        </form>
        <p className="hint">Cuenta demo: demo@local.test / password123. Para crear otra cuenta, cambia el correo.</p>
        <button className="link-button" onClick={() => setMode(mode === "register" ? "login" : "register")}>
          {mode === "register" ? "Ya tengo cuenta" : "Crear una cuenta nueva"}
        </button>
      </section>
    </main>
  );
}

function JobForm({ onCreated }) {
  const [form, setForm] = useState(emptyJob);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);
  const previewRequest = useRef(0);
  const fieldOverrides = useRef({});
  const [error, setError] = useState("");

  function update(path, value) {
    setForm((current) => {
      if (path.startsWith("selectors.")) {
        const key = path.split(".")[1];
        return { ...current, selectors: { ...current.selectors, [key]: value } };
      }
      return { ...current, [path]: value };
    });
  }

  function toggleField(key) {
    setForm((current) => {
      const currentFields = new Set(current.visibleFields || defaultVisibleFields);
      if (currentFields.has(key)) {
        currentFields.delete(key);
      } else {
        currentFields.add(key);
      }
      fieldOverrides.current[key] = currentFields.has(key);
      return { ...current, visibleFields: [...currentFields] };
    });
  }

  async function previewProduct(nextUrl = form.url) {
    if (!/^https?:\/\//i.test(nextUrl.trim())) return;
    const request = ++previewRequest.current;
    setPreviewing(true);
    setError("");
    try {
      const payload = await api("/api/preview", {
        method: "POST",
        body: { url: nextUrl.trim(), selectors: form.selectors }
      });
      if (request !== previewRequest.current) return;
      setPreview(payload.data);
      setForm((current) => ({
        ...current,
        title: current.title || (payload.data.name === "Nombre no detectado" ? "" : payload.data.name),
        url: nextUrl.trim(),
        visibleFields: recognizedSelection(fieldOptions, payload.data, fieldOverrides.current)
      }));
    } catch (err) {
      if (request !== previewRequest.current) return;
      setPreview(null);
      setError(err.message);
    } finally {
      if (request === previewRequest.current) setPreviewing(false);
    }
  }

  function updateUrl(value) {
    previewRequest.current += 1;
    setPreviewing(false);
    fieldOverrides.current = {};
    setForm(current => ({ ...current, title: "", url: value, selectors: { name: "", price: "", image: "" }, visibleFields: [] }));
    setPreview(null);
  }

  useEffect(() => {
    if (!/^https?:\/\//i.test(form.url.trim())) return undefined;
    const timer = setTimeout(() => previewProduct(form.url), 700);
    return () => clearTimeout(timer);
  }, [form.url, JSON.stringify(form.selectors)]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = await api("/api/jobs", { method: "POST", body: form });
      onCreated(payload.job);
      previewRequest.current += 1;
      fieldOverrides.current = {};
      setForm(emptyJob);
      setPreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="job-form" onSubmit={submit}>
      <div className="form-header">
        <div>
          <span className="eyebrow">Añadir producto</span>
          <h2>¿Qué producto seguimos?</h2>
        </div>
        <button className="primary-button compact" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
          Agregar
        </button>
      </div>

      <div className="url-row">
        <label>
          Enlace del producto
          <input
            value={form.url}
            onChange={(event) => updateUrl(event.target.value)}
            placeholder="https://www.amazon.com.mx/..."
            required
          />
        </label>
        <button className="secondary-button detect-button" type="button" onClick={() => previewProduct()} disabled={previewing || !form.url}>
          {previewing ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
          Detectar
        </button>
      </div>
      <button className="link-button" type="button" onClick={() => updateUrl(`${window.location.origin}/example-product.html`)}>Probar el selector con una página de ejemplo</button>

      {previewing && <div className="detection-progress" role="status"><Loader2 className="spin" size={17} /> Reconociendo la información del producto…</div>}
      {preview && <section className="field-picker detected-picker">
        <div className="detected-heading">
          <div><span className="eyebrow">Información reconocida</span><h3>Ya seleccionamos los datos por ti</h3><p className="hint">Desmarca lo que no quieras incluir en tu monitoreo.</p></div>
          <span className="selection-count" aria-live="polite">{form.visibleFields.length} de {fieldOptions.length} seleccionados</span>
        </div>
        <div className="selection-tools">
          <button type="button" className="link-button" onClick={() => { fieldOverrides.current = Object.fromEntries(fieldOptions.map(field => [field.key, fieldRecognized(field, preview)])); update('visibleFields', recognizedSelection(fieldOptions, preview)); }}>Seleccionar reconocidos</button>
          <button type="button" className="link-button" onClick={() => { fieldOverrides.current = Object.fromEntries(fieldOptions.map(field => [field.key, false])); update('visibleFields', []); }}>Desmarcar todos</button>
        </div>
        <div className="field-options detected-options">
          {fieldOptions.map(field => {
            const detected = fieldRecognized(field, preview);
            const checked = form.visibleFields.includes(field.key);
            return <label key={field.key} className={'field-option detected-option' + (checked ? ' selected' : '') + (!detected ? ' undetected' : '')}>
              <input type="checkbox" aria-label={field.label} checked={checked} onChange={() => toggleField(field.key)} />
              <div className="detected-value"><span className="detected-label">{field.label}<small>{detected ? 'Reconocido' : 'Sin detectar'}</small></span>
              {field.key === 'image' && preview.image ? <img src={preview.image} alt="Imagen reconocida" /> : <strong title={String(preview[field.previewKey] || '')}>{field.key === 'history' ? detected ? 'Gráfica y cambios de precio' : 'Necesita un precio' : formatFieldValue(field.previewKey, preview[field.previewKey])}</strong>}</div>
            </label>;
          })}
        </div>
      </section>}
      {/^https?:\/\//i.test(form.url.trim()) && <details className="visual-adjustment">
        <summary><Search size={17} /><span>Ajustar datos en la página<span className="summary-note">Opcional · selecciona otra parte si lo necesitas</span></span></summary>
        <PageInspector url={form.url.trim()} selectors={form.selectors} detected={preview} selectedFields={form.visibleFields} onToggle={toggleField} onSelect={(key, selector) => {
          update(`selectors.${key}`, selector);
          if (selector) { fieldOverrides.current[key] = true; setForm(current => ({ ...current, visibleFields: [...new Set([...current.visibleFields, key])] })); }
        }} />
      </details>}

      <div className="form-grid compact-grid">
        <label className="wide">
          Nombre del monitoreo
          <input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Se completa al detectar el link" required />
        </label>
        <label>
          Precio objetivo (opcional)
          <input value={form.targetPrice} onChange={(event) => update("targetPrice", event.target.value)} inputMode="decimal" placeholder="Ej. 1299" />
        </label>
      </div>

      <div className="control-row">
        <div className="segmented" aria-label="Intervalo">
          {intervalOptions.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={form.intervalMinutes === minutes ? "selected" : ""}
              onClick={() => update("intervalMinutes", minutes)}
            >
              <Clock3 size={15} />
              {minutes} min
            </button>
          ))}
        </div>
      </div>

      <details className="selectors">
        <summary><Settings2 size={16} /> Configuración avanzada</summary>
        <div className="form-grid three">
          <label>
            Nombre
            <input value={form.selectors.name} onChange={(event) => update("selectors.name", event.target.value)} placeholder="h1, .product-title" />
          </label>
          <label>
            Precio
            <input value={form.selectors.price} onChange={(event) => update("selectors.price", event.target.value)} placeholder="#price, .precio" />
          </label>
          <label>
            Imagen
            <input value={form.selectors.image} onChange={(event) => update("selectors.image", event.target.value)} placeholder=".gallery img" />
          </label>
        </div>
      </details>

      {error && <div className="alert">{error}</div>}
    </form>
  );
}

function JobCard({ job, onRun, onDelete, onIntervalChange, onSelectionChange }) {
  const [editingSelection, setEditingSelection] = useState(false);
  const latest = job.results?.[0];
  const latestData = latest?.data;
  const statusLabel = job.lastStatus === "ok" ? "Correcto" : job.lastStatus === "error" ? "Error" : "Pendiente";
  const points = getPricePoints(job.results);
  const values = points.map((point) => point.value);
  const lowest = values.length ? Math.min(...values) : null;
  const highest = values.length ? Math.max(...values) : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const latestPriceValue = latestData?.priceValue ?? priceNumber(latestData?.price);
  const targetHit = job.targetPrice != null && latestPriceValue != null && latestPriceValue <= job.targetPrice;
  const visibleFields = new Set(job.visibleFields || defaultVisibleFields);
  const shouldShow = (field) => visibleFields.has(field);
  const detailFields = fieldOptions.filter((field) => (
    !["image", "name", "price", "history"].includes(field.key) &&
    shouldShow(field.key) &&
    latestData?.[field.previewKey]
  ));
  const nextRun = getNextRun(job);
  const nextRunLabel = nextRun ? formatDuration(nextRun.getTime() - Date.now()) : "Pausado";

  return (
    <article className={`job-card ${!shouldShow("image") && !shouldShow("pagePreview") ? "no-image" : ""}`}>
      <div className="saved-selection-toolbar"><button className="secondary-button" onClick={() => setEditingSelection(!editingSelection)}><Search size={16} />{editingSelection ? "Cerrar selector" : "Seleccionar datos de la página"}</button></div>
      {editingSelection && <div className="saved-inspector"><PageInspector url={job.url} selectors={job.selectors || {}} detected={latestData} selectedFields={job.visibleFields || defaultVisibleFields} onToggle={key => onSelectionChange(job, key, undefined)} onSelect={(key, selector) => onSelectionChange(job, key, selector)} /></div>}
      {(shouldShow("pagePreview") || shouldShow("image")) && (
        <div className="visual-rail">
          {shouldShow("pagePreview") && (
            <ProductPagePreview url={job.url} title={latestData?.name || job.title} />
          )}
          {shouldShow("image") && (
            <div className="product-image">
              {latestData?.image ? <img src={latestData.image} alt={latestData.name || job.title} /> : <Camera size={34} />}
            </div>
          )}
        </div>
      )}
      <div className="job-content">
        <div className="job-topline">
          <div>
            <h3>{shouldShow("name") ? (latestData?.name || job.title) : job.title}</h3>
            <a href={job.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Abrir producto
            </a>
          </div>
          <span className={`status ${job.lastStatus}`}>{statusLabel}</span>
        </div>
        {shouldShow("price") && (
          <div className="price-row">
            <strong>{latestData?.price || "Sin precio todavía"}</strong>
            <span>Cada {job.intervalMinutes} min</span>
            <span>Próxima: {nextRunLabel}</span>
            <span>HTML</span>
          </div>
        )}
        {!shouldShow("price") && (
          <div className="price-row">
            <span>Cada {job.intervalMinutes} min</span>
            <span>Próxima: {nextRunLabel}</span>
            <span>HTML</span>
          </div>
        )}
        <div className="card-intervals" aria-label="Cambiar intervalo">
          {intervalOptions.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={job.intervalMinutes === minutes ? "selected" : ""}
              onClick={() => onIntervalChange(job, minutes)}
            >
              {minutes}
            </button>
          ))}
        </div>
        {detailFields.length > 0 && (
          <div className="job-data-grid">
            {detailFields.map((field) => (
              <div key={field.key}>
                <span>{field.label}</span>
                <strong>{formatFieldValue(field.previewKey, latestData?.[field.previewKey])}</strong>
              </div>
            ))}
          </div>
        )}
        {job.lastError && <div className="alert slim">{job.lastError}</div>}
        {targetHit && (
          <div className="deal-alert">
            <BellRing size={16} />
            Precio igual o menor a tu objetivo de {formatMoney(job.targetPrice)}
          </div>
        )}
        {shouldShow("history") && (
          <div className="keepa-panel">
            <PriceHistoryChart points={points} currency={latestData?.currency} />
            <div className="price-stats">
              <div><span>Mínimo</span><strong>{formatMoney(lowest, latestData?.currency)}</strong></div>
              <div><span>Promedio</span><strong>{formatMoney(average, latestData?.currency)}</strong></div>
              <div><span>Máximo</span><strong>{formatMoney(highest, latestData?.currency)}</strong></div>
            </div>
          </div>
        )}
        {shouldShow("history") && points.length > 0 && (
          <div className="price-timeline">
            {points.slice(-5).reverse().map((point, index, items) => {
              const previousPoint = items[index + 1];
              const change = previousPoint ? point.value - previousPoint.value : 0;
              return (
                <div key={point.id} className="timeline-item">
                  <span>{formatShortDate(point.date)}</span>
                  <strong>{formatMoney(point.value, latestData?.currency)}</strong>
                  <b className={change < 0 ? "down" : change > 0 ? "up" : ""}>
                    {previousPoint ? `${change > 0 ? "+" : ""}${formatMoney(change, latestData?.currency)}` : "Inicial"}
                  </b>
                </div>
              );
            })}
          </div>
        )}
        <div className="history">
          {(job.results || []).slice(0, 4).map((result) => (
            <div key={result.id} className="history-item">
              {result.status === "ok" ? <CheckCircle2 size={15} /> : <Activity size={15} />}
              <span>{formatDate(result.createdAt)}</span>
              <b>{result.status === "ok" ? result.data.price : "Error"}</b>
            </div>
          ))}
        </div>
        <div className="job-actions">
          <button className="secondary-button" onClick={() => onRun(job.id)}>
            <Play size={16} />
            Revisar ahora
          </button>
          <button className="icon-button danger" aria-label="Eliminar monitoreo" onClick={() => onDelete(job.id)}>
            <Trash2 size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}

function MonitorTable({ jobs, now, busyId, onRun, onDetails, expandedId }) {
  const columns = fieldOptions.filter(field => !['pagePreview', 'history', 'checkedAt', 'sourceUrl', 'name'].includes(field.key) && jobs.some(job => (job.visibleFields || defaultVisibleFields).includes(field.key)));
  return <div className="monitor-table-wrap"><table className="monitor-table">
    <caption><span className="live-dot" /> Seguimiento en vivo · peticiones automáticas cada 5 minutos mientras el servidor está encendido</caption>
    <thead><tr><th>Monitoreo</th>{columns.map(field => <th key={field.key}>{field.label}</th>)}<th>Cambio de precio</th><th>Última petición</th><th>Siguiente revisión</th><th>Acciones</th></tr></thead>
    <tbody>{jobs.map(job => {
      const latest = job.results?.[0];
      const successful = (job.results || []).filter(result => result.status === 'ok');
      const data = successful[0]?.data;
      const current = data?.priceValue;
      const previous = successful[1]?.data?.priceValue;
      const delta = current != null && previous != null ? current - previous : null;
      const remaining = Math.max(0, (getNextRun(job)?.getTime() || now) - now);
      const seconds = Math.ceil(remaining / 1000);
      const running = job.running || busyId === job.id;
      return <tr key={job.id} className={job.lastStatus === 'error' ? 'row-error' : ''}>
        <td className="cell-product" data-label="Producto"><strong title={job.title}>{(job.visibleFields || defaultVisibleFields).includes("name") ? data?.name || job.title : job.title}</strong><a href={job.url} target="_blank" rel="noreferrer">{new URL(job.url).hostname} ↗</a><span className={'status ' + job.lastStatus}>{running ? 'Consultando…' : job.lastStatus === 'error' ? 'Error de consulta' : job.lastStatus === 'ok' ? 'Actualizado' : 'Pendiente'}</span></td>
        {columns.map(field => <td key={field.key} data-label={field.label} className={`cell-${field.key} ${!(job.visibleFields || defaultVisibleFields).includes(field.key) ? "cell-unselected" : ""}`}>{!(job.visibleFields || defaultVisibleFields).includes(field.key) ? '—' : field.key === 'image' ? data?.image ? <img src={data.image} alt={data.name || job.title} /> : '—' : <span title={String(data?.[field.previewKey] || '')}>{formatFieldValue(field.previewKey, data?.[field.previewKey])}</span>}</td>)}
        <td data-label="Cambio de precio"><span className={'change-badge ' + (delta < 0 ? 'down' : delta > 0 ? 'up' : '')}>{job.lastStatus === 'error' ? 'Sin verificar' : delta == null ? 'Primera lectura' : delta === 0 ? 'Sin cambios' : (delta > 0 ? '↑ +' : '↓ ') + formatMoney(delta, data?.currency)}</span>{job.lastError && <small className="table-error">{job.lastError}</small>}</td>
        <td data-label="Última petición">{formatDate(latest?.createdAt)}{job.lastStatus === 'error' && data && <small>Último dato válido: {formatDate(data.checkedAt)}</small>}</td>
        <td data-label="Siguiente revisión"><strong className="countdown">{!job.active ? 'Pausado' : running ? 'Consultando…' : seconds === 0 ? 'En cola…' : String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')}</strong><div className="countdown-track"><i style={{ width: Math.min(100, remaining / 3000) + '%' }} /></div><small>Cada 5 minutos</small></td>
        <td className="cell-actions" data-label="Acciones"><div className="table-actions"><button className="secondary-button" disabled={running} onClick={() => onRun(job.id)}>{running ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}Revisar ahora</button><button className="link-button" onClick={() => onDetails(job.id)}>{expandedId === job.id ? 'Cerrar detalles' : 'Ver página e historial'}</button></div></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

function Dashboard({ user, onLogout }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [expandedId, setExpandedId] = useState("");
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const stats = useMemo(() => {
    const ok = jobs.filter((job) => job.lastStatus === "ok").length;
    const errors = jobs.filter((job) => job.lastStatus === "error").length;
    return { ok, errors, total: jobs.length };
  }, [jobs]);

  async function loadJobs() {
    const payload = await api("/api/jobs");
    setJobs(payload.jobs);
  }

  useEffect(() => {
    loadJobs().catch(err => setActionError(err.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!jobs.length) {
      const timer = setTimeout(() => loadJobs().catch(() => {}), 30000);
      return () => clearTimeout(timer);
    }

    const nextRunTimes = jobs
      .map((job) => getNextRun(job)?.getTime())
      .filter(Boolean);
    const nextDelay = nextRunTimes.length
      ? Math.min(...nextRunTimes.map((time) => Math.max(time - Date.now() + 2500, 8000)))
      : 30000;
    const timer = setTimeout(() => loadJobs().catch(() => {}), Math.min(nextDelay, 30000));
    return () => clearTimeout(timer);
  }, [jobs]);

  async function runNow(id) {
    setBusyId(id);
    setActionError("");
    try {
      const payload = await api(`/api/jobs/${id}/run`, { method: "POST" });
      setJobs((current) => current.map((job) => (job.id === id ? payload.job : job)));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function updateInterval(job, intervalMinutes) {
    if (job.intervalMinutes === intervalMinutes) return;
    const payload = await api(`/api/jobs/${job.id}`, {
      method: "PUT",
      body: {
        title: job.title,
        url: job.url,
        intervalMinutes,
        selectors: job.selectors,
        visibleFields: job.visibleFields,
        targetPrice: job.targetPrice,
        active: job.active
      }
    });
    setJobs((current) => current.map((item) => (item.id === job.id ? payload.job : item)));
  }

  async function updateSelection(job, key, selector) {
    setActionError('');
    try {
      const payload = await api('/api/jobs/' + job.id, { method: 'PUT', body: { ...job, intervalMinutes: 5, selectors: selector === undefined ? job.selectors : { ...job.selectors, [key]: selector }, visibleFields: selector === undefined ? (job.visibleFields || defaultVisibleFields).includes(key) ? (job.visibleFields || defaultVisibleFields).filter(field => field !== key) : [...(job.visibleFields || defaultVisibleFields), key] : [...new Set([...(job.visibleFields || defaultVisibleFields), key])] } });
      setJobs(current => current.map(item => item.id === job.id ? payload.job : item));
      if (selector !== undefined) await runNow(job.id);
    } catch (err) { setActionError(err.message); }
  }

  async function deleteJob(id) {
    await api(`/api/jobs/${id}`, { method: "DELETE" });
    setJobs((current) => current.filter((job) => job.id !== id));
  }

  async function logout() {
    await api("/api/logout", { method: "POST" });
    onLogout();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Tu espacio de seguimiento</span>
          <h1>Tus productos, al día</h1>
          <p className="topbar-copy">Selecciona datos de la página y sigue sus cambios cada 5 minutos.</p>
        </div>
        <div className="top-actions">
          <span className="user-chip">
            <UserRound size={16} />
            {user.email}
          </span>
          <button className="icon-button" aria-label="Actualizar" onClick={loadJobs}>
            <RefreshCw size={18} />
          </button>
          <button className="secondary-button" onClick={logout}>
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <div><span>Total</span><strong>{stats.total}</strong></div>
        <div><span>Actualizados</span><strong>{stats.ok}</strong></div>
        <div><span>Por revisar</span><strong>{stats.errors}</strong></div>
      </section>

      <JobForm onCreated={(job) => { setJobs(current => [job, ...current]); setExpandedId(job.id); }} />

      {actionError && <div className="alert" role="alert">{actionError}</div>}
      <section className="jobs-section">
        <div className="section-title">
          <h2>Productos</h2>
          {busyId && <span><Loader2 className="spin" size={15} /> Revisando</span>}
        </div>
        {loading ? (
          <div className="empty-state"><Loader2 className="spin" size={28} /> Cargando monitoreos...</div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">Agrega un link de Amazon, Mercado Libre, Impuls, Chapur, Nike o Adidas para empezar.</div>
        ) : (
          <>
            <MonitorTable jobs={jobs} now={now} busyId={busyId} onRun={runNow} onDetails={id => setExpandedId(expandedId === id ? '' : id)} expandedId={expandedId} />
            {jobs.filter(job => job.id === expandedId).map(job => <JobCard key={job.id} job={job} onRun={runNow} onDelete={id => deleteJob(id).catch(err => setActionError(err.message))} onIntervalChange={updateInterval} onSelectionChange={updateSelection} />)}
          </>
        )}
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api("/api/me")
      .then((payload) => setUser(payload.user || null))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <div className="boot"><Loader2 className="spin" size={30} /> Preparando panel...</div>;
  }

  return user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <AuthScreen onAuth={setUser} />;
}

const root = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.dispose(data => { data.root = root; });
root.render(<App />);
