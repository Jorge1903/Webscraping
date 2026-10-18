# Scraping Monitor

Aplicacion React + Node para registrar productos y revisarlos cada 5 minutos. Guarda usuarios, sesiones, monitoreos e historial local en `data/db.json`. El servidor debe permanecer encendido para hacer las revisiones; el navegador puede cerrarse.

La idea es funcionar como una base estilo Keepa: cada revision guarda precio, nombre e imagen; el panel muestra historial, minimo, promedio, maximo y una alerta visual cuando el precio cae por debajo del objetivo.

## Ejecutar con Docker Desktop

Abre Docker Desktop con el motor Linux activo. Desde la carpeta del proyecto:

```bash
docker compose up -d --build --wait
```

Abre http://localhost:3001. Docker compila React y ejecuta el backend Node en un
solo contenedor. El frontend usa la API del mismo contenedor; no necesita Vercel
para funcionar localmente. Puedes cambiar el puerto creando un archivo `.env`
con `MONITOR_PORT=3002` y volviendo a ejecutar el comando.

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose stop
docker compose start
```

`Dockerfile` define la imagen y `compose.yaml` configura el servicio, el puerto y
la persistencia. `.dockerignore` evita incluir datos personales, secretos y
dependencias locales en la imagen. La compilación se realiza en una etapa
separada y el servidor se ejecuta con el usuario `node`.

### Datos existentes y respaldo

La carpeta `./data` de tu laptop se monta en `/app/data` del contenedor. Se usan
las cuentas y productos de `data/db.json`, sin importarlos ni incluirlos en la
imagen. Los datos sobreviven al reemplazo o eliminación del contenedor mientras
conserves esa carpeta. Al arrancar se reanudan los monitoreos activos.

No ejecutes el servidor con npm y Docker simultáneamente sobre el mismo archivo:
ambos mantienen el estado en memoria y podrían sobrescribir cambios. Tampoco
escales este servicio a varias instancias con el almacenamiento JSON actual.

Para respaldar de forma consistente en PowerShell, detén primero todas las
instancias que escriban en `data/db.json`:

```powershell
docker compose stop
Copy-Item -LiteralPath data/db.json -Destination ("data/backup-" + (Get-Date -Format yyyyMMdd-HHmmss) + ".json")
docker compose start
```

Para actualizar el código, ejecuta de nuevo `docker compose up -d --build --wait`.
Para retirar el contenedor y su red, usa `docker compose down`; la carpeta `data`
permanece en tu laptop. Docker Desktop y el equipo deben estar encendidos para
que las revisiones locales continúen.

### Render, Vercel y PostgreSQL

Consulta [DEPLOYMENT.md](DEPLOYMENT.md) para los valores de Vercel, el estado
actual de Render y la propuesta Docker en `render.docker.example.yaml`.
La propuesta remota mantiene Free por eleccion del usuario, sin disco persistente,
y requiere respaldar los datos de Render antes de aplicarla. Es para demostracion
mientras no se implemente persistencia; no se importa automaticamente.

Esta configuración dockeriza la aplicación actual, que todavía guarda sus datos
en JSON. No crea PostgreSQL ni migra datos automáticamente. Esa migración requiere
tablas, consultas y un proceso de importación aparte.

Para desplegar esta imagen en Render, selecciona el entorno Docker y el
`Dockerfile` de la raíz. Usa una sola instancia y configura un disco persistente
montado en `/app/data` con permisos de escritura para el usuario `node` (UID 1000),
o migra antes a PostgreSQL. Sin persistencia, los cambios del JSON se pierden al
recrear el contenedor. El puerto respeta la variable `PORT` de Render y el servidor
escucha en `0.0.0.0`. No se ha cambiado ningún despliegue remoto.

Vercel puede seguir alojando React y enviando `/api` a Render mediante
`vercel.json`. Docker local usa su propia carpeta `data`; no sincroniza datos con
Render. Un servicio que se suspende por inactividad interrumpe el programador
interno, por lo que monitorear continuamente requiere un servicio siempre activo.

## Ejecutar en desarrollo

```bash
npm install
npm run dev
```

Abre:

```text
http://127.0.0.1:5173
```

## Produccion local

```bash
npm run build
npm start
```

Abre:

```text
http://localhost:3000
```

## Como usarlo

1. Crea una cuenta o inicia sesion.
2. Pega el link del producto de Amazon, Mercado Libre, Impuls, Chapur, Nike, Adidas u otra tienda.
3. Al pegar el enlace se reconocen automáticamente nombre, precio, moneda, imagen, descripción y disponibilidad cuando están presentes. Los datos reconocidos aparecen marcados y muestran su valor; desmarca los que no quieras. "Seleccionar reconocidos" y "Desmarcar todos" permiten cambiar la selección en bloque.
4. Para corregir algún dato, abre "Ajustar datos en la página". Los elementos reconocidos ya están resaltados; puedes desmarcarlos o elegir otra parte y confirmar el valor aislado. Puedes ampliar la vista para seleccionar con precisión. Volver a detectar conserva las casillas que cambiaste; un nuevo enlace inicia una selección nueva.
5. Opcionalmente agrega una alerta de precio, por ejemplo `1299`.
6. Elige qué columnas y detalles guardar. La tabla muestra el precio, su variación, la última petición y la cuenta regresiva. El único intervalo es de 5 minutos, también para los monitoreos anteriores.
7. Usa "Revisar ahora" para consultar de inmediato, o "Ver página e historial" para abrir la vista grande, la gráfica y el selector de un producto guardado.
8. Puedes practicar con "Probar el selector con una página de ejemplo" sin depender de una tienda externa.

Las selecciones visuales se guardan como selectores CSS y se ejecutan con el mismo parser en las siguientes peticiones. Si la parte seleccionada desaparece, la revisión muestra un error y la tabla conserva el último dato válido. La vista bloquea scripts, formularios y navegación para seleccionar elementos sin ejecutar acciones de la tienda.

La interfaz usa un tema oscuro completo, tipografía con caracteres españoles, estados de foco visibles y animaciones breves que respetan la preferencia de movimiento reducido del sistema.

## Verificación

`node scripts/verify-monitor.mjs` verifica selectores, historial, cambios de precio, bloqueo de scripts, intervalo único y una revisión automática vencida. Usa un servidor de tienda local y una base temporal aislada; no modifica los productos del usuario.

## Extraccion HTML

La app intenta leer `JSON-LD`, metadatos Open Graph, Twitter cards, `<title>` y selectores CSS desde el HTML que responde la pagina. La vista previa usa el mismo extractor que el monitoreo, asi que sirve para confirmar que el link esta entregando datos antes de guardarlo.

## Nota importante

React solo no puede hacer scraping confiable de otros dominios por CORS y por restricciones de los navegadores. Por eso esta app incluye un backend Node que hace las consultas.

Si un producto de Amazon, Mercado Libre u otra tienda muestra error de conexion o bloqueo, no significa que el formulario este roto. Significa que esa tienda no entrego el HTML al servidor local o lo cargo con JavaScript despues de abrir la pagina.
