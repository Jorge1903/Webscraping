# Despliegue y persistencia

## Entornos

| Entorno | Interfaz | Backend | Datos |
| --- | --- | --- | --- |
| Laptop | http://localhost:3001 | Node en Docker | PostgreSQL en Docker, volumen postgres-data |
| Publicado | https://webscraping-psi.vercel.app | Docker en Render Free | webscraping-postgres en Render Free |

Las bases local y publicada son independientes. No se sincronizan automaticamente.
Docker Desktop, el servicio app y el servicio db deben estar encendidos para usar
la version Docker local. La web publicada funciona con la laptop apagada.

## Vercel

Proyecto: emmanuelgarciachang-4315s-projects/webscraping.
Repositorio: Jorge1903/Webscraping, rama main, directorio raiz del repositorio.

- Framework: Vite.
- Instalacion: npm ci.
- Compilacion: npm run build.
- Salida: dist.
- Proxy: /api/:path* a https://webscraping-wnii.onrender.com/api/:path*.

La configuracion esta en vercel.json. Vercel no recibe credenciales de PostgreSQL.
Si cancela un despliegue por firma de commit no verificada, se puede usar Redeploy
sobre ese despliegue desde la cuenta autorizada, sin cambiar protecciones del proyecto.

## Render

Servicio: srv-db81s0ivcj2c73fsmh5g, Webscraping, Oregon, rama main.
Configuracion objetivo: runtime Docker, Dockerfile ./Dockerfile, contexto raiz,
sin comandos npm adicionales, health check /api/health, Auto-Deploy Off.
El despliegue es manual para revisar migraciones y respaldos antes de publicar.

Variables:

- HOST: 0.0.0.0.
- NODE_ENV: production.
- DATABASE_URL: URL interna de webscraping-postgres, guardada como secreto en Render.
- PORT: lo proporciona Render; no fijarlo a 3001.

render.docker.example.yaml documenta el servicio y PostgreSQL Free sin secretos.
No se importa automaticamente y no es necesario crear otra base al usarlo.
La base creada el 18 de octubre de 2026 vence el 17 de noviembre de 2026 segun el
panel de Render. No se contrataron planes de pago. Antes de esa fecha hay que
exportar la base y elegir otro alojamiento o plan; Free no es almacenamiento indefinido.
El backend Free tambien se suspende por inactividad: durante esa suspension no
se ejecutan revisiones. Las lecturas de la interfaz reintentan fallos temporales,
pero esto no convierte Free en un servicio siempre activo.

## Almacenamiento y migracion

Con DATABASE_URL, el backend guarda usuarios, sesiones, monitoreos y resultados
como estado JSONB en la tabla monitor_state. Se mantiene una sola instancia de
backend y las escrituras se serializan. Cada arranque reclama una identidad de
escritura: el proceso anterior deja de guardar durante el traspaso del despliegue,
sin sobrescribir al proceso nuevo. Si PostgreSQL falla, no se usa un archivo
temporal como sustituto. La importacion manual no reclama esa identidad.

Al inicializar una base vacia, se importa MONITOR_DB_PATH si existe. No se
sobrescriben bases con datos ni se migran sesiones de otro entorno. El JSON local
se conserva como respaldo, pero deja de actualizarse al usar PostgreSQL.

Importacion manual, con una DATABASE_URL proporcionada por entorno:

    node scripts/import-postgres.mjs data/db.json

Se migraron los 5 usuarios, 14 monitoreos y 500 resultados disponibles localmente.
Los datos que ya se hayan perdido del filesystem efimero remoto no se pueden
recuperar sin un respaldo. La cuenta demo se crea cuando falta y nunca sustituye
una cuenta existente: demo@local.test / password123. ENABLE_DEMO_ACCOUNT=false
permite desactivar su creacion. Contraseñas y sesiones no se suben a GitHub.

Para consultar PostgreSQL usa pgAdmin o DBeaver; MySQL Workbench es para MySQL.
Conexion local: host 127.0.0.1, puerto 5433, base monitor, usuario monitor.
La contraseña de desarrollo por defecto es monitor_local_only y puede fijarse con
POSTGRES_PASSWORD en .env antes de crear el volumen. Cambiar .env no cambia por
si solo la contraseña de un volumen ya inicializado. Esas credenciales son solo
locales; no se usan para Render.

## Respaldo local PostgreSQL

Desde la carpeta del proyecto:

    docker compose exec -T db pg_dump -U monitor -Fc -f /tmp/monitor.dump monitor
    docker compose cp db:/tmp/monitor.dump data/monitor-backup.dump

Conserva el archivo fuera del repositorio. No ejecutes docker compose down -v:
el parametro -v elimina el volumen de PostgreSQL. docker compose down conserva
el volumen. Para respaldar Render usa pg_dump con su conexion externa TLS desde
un entorno autorizado; no publiques esa URL ni la guardes en archivos versionados.

## Verificaciones

    npm run build
    node scripts/verify-monitor.mjs
    node scripts/verify-api.mjs
    node scripts/verify-storage.mjs

Las pruebas usan datos temporales. MONITOR_TEST_DATABASE_URL permite ejecutar
verify-monitor y verify-storage contra una base PostgreSQL de pruebas vacia,
independiente; nunca apuntarla a la base real del usuario.

Referencias: https://render.com/docs/free y https://render.com/docs/docker.
