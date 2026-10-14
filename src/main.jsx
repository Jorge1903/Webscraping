import React, { useEffect, useMemo, useState } from "react";
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

const intervalOptions = [5, 10, 30];

const fieldOptions = [
  { key: "pagePreview", label: "Mini pagina", previewKey: "sourceUrl" },
  { key: "image", label: "Imagen", previewKey: "image" },
  { key: "name", label: "Nombre", previewKey: "name" },
  { key: "price", label: "Precio", previewKey: "price" },
  { key: "currency", label: "Moneda", previewKey: "currency" },
  { key: "availability", label: "Disponibilidad", previewKey: "availability" },
  { key: "description", label: "Descripcion", previewKey: "description" },
  { key: "checkedAt", label: "Fecha de revision", previewKey: "checkedAt" },
  { key: "sourceUrl", label: "URL final", previewKey: "sourceUrl" },
  { key: "history", label: "Historial y grafica", previewKey: "price" }
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

function formatMoney(value) {
  if (value == null) return "N/D";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
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
  if (!value) return "No detectado";
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

function PriceHistoryChart({ points }) {
  const latest = points.at(-1);
  const previous = points.at(-2);
  const delta = latest && previous ? latest.value - previous.value : 0;
  const deltaLabel = latest && previous ? `${delta > 0 ? "+" : ""}${formatMoney(delta)}` : "Sin cambio previo";

  if (!points.length) {
    return (
      <div className="history-chart chart-empty">
        <strong>Historial de precio</strong>
        <span>Se dibujara cuando la primera revision detecte un precio.</span>
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className="history-chart single-point">
        <div className="chart-heading">
          <div>
            <span className="eyebrow">Historial de precio</span>
            <strong>{formatMoney(latest.value)}</strong>
          </div>
          <span>1 punto</span>
        </div>
        <div className="single-price-line">
          <span>{formatShortDate(latest.date)}</span>
          <b>{formatMoney(latest.value)}</b>
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
          <span className="eyebrow">Historial de precio</span>
          <strong>{formatMoney(latest.value)}</strong>
        </div>
        <span className={delta < 0 ? "delta down" : delta > 0 ? "delta up" : "delta"}>
          {deltaLabel}
        </span>
      </div>
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafica de historial de precio">
        {ticks.map((tick) => {
          const y = padding.top + chartHeight - ((tick - chartMin) / range) * chartHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} />
              <text x={padding.left - 10} y={y + 4} textAnchor="end">{formatMoney(tick)}</text>
            </g>
          );
        })}
        <polygon points={areaPoints} />
        <polyline points={linePoints} />
        {coords.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="4.5" />
            <title>{`${formatShortDate(point.date)} - ${formatMoney(point.value)}`}</title>
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
          title={`Miniatura de ${title || url}`}
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
        setError("Ese correo ya existe. Cambie a iniciar sesion para que puedas entrar con esa cuenta.");
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
        <p>Registra productos, define cada cuanto revisarlos y guarda el historial de nombre, precio e imagen.</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Correo
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </label>
          <label>
            Contrasena
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
      return {
        ...current,
        visibleFields: currentFields.size ? [...currentFields] : defaultVisibleFields
      };
    });
  }

  async function previewProduct(nextUrl = form.url) {
    if (!/^https?:\/\//i.test(nextUrl.trim())) return;
    setPreviewing(true);
    setError("");
    try {
      const payload = await api("/api/preview", {
        method: "POST",
        body: { url: nextUrl.trim(), selectors: form.selectors }
      });
      setPreview(payload.data);
      setForm((current) => ({
        ...current,
        title: current.title || (payload.data.name === "Nombre no detectado" ? "" : payload.data.name),
        url: nextUrl.trim()
      }));
    } catch (err) {
      setPreview(null);
      setError(err.message);
    } finally {
      setPreviewing(false);
    }
  }

  function updateUrl(value) {
    update("url", value);
    setPreview(null);
  }

  useEffect(() => {
    if (!/^https?:\/\//i.test(form.url.trim())) return undefined;
    const timer = setTimeout(() => previewProduct(form.url), 700);
    return () => clearTimeout(timer);
  }, [form.url, form.selectors.name, form.selectors.price, form.selectors.image]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = await api("/api/jobs", { method: "POST", body: form });
      onCreated(payload.job);
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
          <span className="eyebrow">Nuevo monitoreo</span>
          <h2>Pega el link del producto</h2>
        </div>
        <button className="primary-button compact" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
          Agregar
        </button>
      </div>

      <div className="url-row">
        <label>
          Link del producto
          <input
            value={form.url}
            onChange={(event) => updateUrl(event.target.value)}
            onBlur={() => previewProduct()}
            placeholder="https://www.amazon.com.mx/..."
            required
          />
        </label>
        <button className="secondary-button detect-button" type="button" onClick={() => previewProduct()} disabled={previewing || !form.url}>
          {previewing ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
          Detectar
        </button>
      </div>

      {preview && (
        <div className="preview-panel">
          <div className="preview-image">
            {preview.image ? <img src={preview.image} alt={preview.name || "Producto detectado"} /> : <Search size={28} />}
          </div>
          <div className="preview-copy">
            <span className="eyebrow">Detectado</span>
            <strong>{preview.name}</strong>
            <div className="preview-meta">
              <span>{preview.price}</span>
              {preview.availability && <span>{preview.availability.replace(/^https?:\/\/schema.org\//, "")}</span>}
              {preview.currency && <span>{preview.currency}</span>}
            </div>
            {preview.description && <p>{preview.description}</p>}
          </div>
          <div className="preview-data">
            {fieldOptions
              .filter((field) => field.key !== "history")
              .map((field) => (
                <div key={field.key} className={form.visibleFields.includes(field.key) ? "selected" : ""}>
                  <span>{field.label}</span>
                  <strong>{formatFieldValue(field.previewKey, preview[field.previewKey])}</strong>
                </div>
              ))}
          </div>
        </div>
      )}

      <section className="field-picker">
        <div>
          <span className="eyebrow">Campos visibles</span>
          <h3>Elige que se mostrara en la tarjeta</h3>
        </div>
        <div className="field-options">
          {fieldOptions.map((field) => (
            <label key={field.key} className={form.visibleFields.includes(field.key) ? "field-option selected" : "field-option"}>
              <input
                type="checkbox"
                checked={form.visibleFields.includes(field.key)}
                onChange={() => toggleField(field.key)}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="form-grid compact-grid">
        <label className="wide">
          Nombre guardado
          <input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Se completa al detectar el link" required />
        </label>
        <label>
          Alerta de precio
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
        <summary><Settings2 size={16} /> Selectores opcionales</summary>
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

function JobCard({ job, onRun, onDelete, onIntervalChange }) {
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
            <strong>{latestData?.price || "Sin precio todavia"}</strong>
            <span>Cada {job.intervalMinutes} min</span>
            <span>Proxima: {nextRunLabel}</span>
            <span>HTML</span>
          </div>
        )}
        {!shouldShow("price") && (
          <div className="price-row">
            <span>Cada {job.intervalMinutes} min</span>
            <span>Proxima: {nextRunLabel}</span>
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
            <PriceHistoryChart points={points} />
            <div className="price-stats">
              <div><span>Minimo</span><strong>{formatMoney(lowest)}</strong></div>
              <div><span>Promedio</span><strong>{formatMoney(average)}</strong></div>
              <div><span>Maximo</span><strong>{formatMoney(highest)}</strong></div>
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
                  <strong>{formatMoney(point.value)}</strong>
                  <b className={change < 0 ? "down" : change > 0 ? "up" : ""}>
                    {previousPoint ? `${change > 0 ? "+" : ""}${formatMoney(change)}` : "Inicial"}
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

function Dashboard({ user, onLogout }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
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
    loadJobs().finally(() => setLoading(false));
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
    try {
      const payload = await api(`/api/jobs/${id}/run`, { method: "POST" });
      setJobs((current) => current.map((job) => (job.id === id ? payload.job : job)));
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
          <span className="eyebrow">Panel de scraping</span>
          <h1>Monitoreo de productos</h1>
          <p className="topbar-copy">Revisiones automaticas cada 5, 10 o 30 minutos con historial y alertas.</p>
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
        <div><span>Correctos</span><strong>{stats.ok}</strong></div>
        <div><span>Con error</span><strong>{stats.errors}</strong></div>
      </section>

      <JobForm onCreated={(job) => setJobs((current) => [job, ...current])} />

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
          <div className="job-list">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onRun={runNow} onDelete={deleteJob} onIntervalChange={updateInterval} />
            ))}
          </div>
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

createRoot(document.getElementById("root")).render(<App />);
