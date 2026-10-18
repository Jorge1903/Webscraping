# Scraping Monitor

Aplicacion React + Node para registrar productos y revisarlos cada 5 minutos. Guarda usuarios, sesiones, monitoreos e historial en PostgreSQL cuando se configura `DATABASE_URL`. Docker ya incluye PostgreSQL; sin esa variable, el modo local con npm conserva `data/db.json`. El servidor debe permanecer encendido para hacer las revisiones; el navegador puede cerrarse.

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

Docker Compose inicia `app` y `db`. PostgreSQL guarda los datos en el volumen
`postgres-data` y escucha localmente en `127.0.0.1:5433`. Al crear una base vacia,
la app importa `data/db.json` sin sobrescribir una base ya poblada ni copiar
sesiones de otro entorno. El archivo original queda como respaldo; los cambios
nuevos se guardan en PostgreSQL. No elimines el volumen con `down -v`.

Para respaldar la base local:

```bash
docker compose exec -T db pg_dump -U monitor -Fc -f /tmp/monitor.dump monitor
docker compose cp db:/tmp/monitor.dump data/monitor-backup.dump
```

Consulta [DEPLOYMENT.md](DEPLOYMENT.md) para las conexiones de desarrollo,
variables, importacion, pruebas y despliegue en Vercel y Render. Para PostgreSQL
puedes usar pgAdmin o DBeaver; MySQL Workbench no corresponde a este motor.

### Render y Vercel

Render usa `DATABASE_URL` para guardar datos fuera del filesystem efimero del
backend. El health check `/api/health` comprueba tambien la conexion de la base.
Vercel publica React y envia `/api` a Render. Las bases local y remota son
independientes. La cuenta demo se crea al arrancar cuando no existe.

El usuario eligio planes Free. PostgreSQL Free de Render creado en esta sesion
vence el **17 de noviembre de 2026**; exporta y migra los datos antes de esa fecha.
El backend Free puede suspenderse por inactividad e interrumpir temporalmente las
revisiones. La interfaz reintenta lecturas temporales 502/503/504 y permite
recargar vistas previas; no repite escrituras automaticamente.

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
