# Configuracion de Vercel y Render

## Funcionamiento local y publicado

| Entorno | Interfaz | API y programador | Almacenamiento |
| --- | --- | --- | --- |
| Local Docker | http://localhost:3001 | Contenedor del proyecto | `./data/db.json` de la laptop |
| Publicado | https://webscraping-psi.vercel.app | https://webscraping-wnii.onrender.com | Archivos propios del servicio de Render |

Para usar Docker local, Docker Desktop y el contenedor deben estar encendidos.
El navegador puede cerrarse y el monitor sigue trabajando mientras el equipo no
se suspenda. `docker compose start` inicia el contenedor existente;
`docker compose up -d --build --wait` aplica cambios del codigo.

Como alternativa, puedes ejecutar `npm run dev` sin Docker. Deten primero el
contenedor (`docker compose stop`) para evitar dos servidores escribiendo sobre
el mismo JSON. El sitio publicado funciona independientemente de tu laptop.

El almacenamiento sigue siendo JSON. No existe una conexion MySQL que puedas
abrir en MySQL Workbench. PostgreSQL tampoco esta implementado todavia.

## Vercel

Proyecto: `emmanuelgarciachang-4315s-projects/webscraping`.

| Ajuste | Valor |
| --- | --- |
| Repositorio | `Jorge1903/Webscraping` |
| Rama de produccion | `main` |
| Framework | Vite |
| Directorio raiz | Raiz del repositorio |
| Instalacion | `npm ci` |
| Compilacion | `npm run build` |
| Salida | `dist` |
| Proxy de API | `/api/:path*` a `https://webscraping-wnii.onrender.com/api/:path*` |

Estos comandos tambien estan en `vercel.json`. Vercel solo publica la interfaz;
no necesita acceso al JSON ni credenciales de base de datos. El navegador usa
`/api` bajo el dominio Vercel y el proxy conserva el flujo de cookies de sesion.

Los comandos se guardaron en el dashboard y se verifico un redeploy de produccion
Ready el 18 de octubre de 2026, con la interfaz y `/api/me` funcionando.

## Render: estado observado y propuesta Docker

Servicio existente: `srv-db81s0ivcj2c73fsmh5g`, nombre `Webscraping`.
La configuracion observada usa Node, plan Free, region Oregon, rama `main`,
build `npm ci`, inicio `npm start` y health check `/api/me`. El usuario eligio
mantener el plan Free; no se ha contratado ningun recurso.

Agregar un Dockerfile al repositorio no cambia por si solo el runtime del
servicio existente. El archivo `render.docker.example.yaml` contiene una
propuesta para el mismo servicio con Docker y plan Free. No es un Blueprint
activo y no se aplica automaticamente. No incluye disco: el JSON del servicio
seguiria siendo efimero. Por ese motivo no se ha cambiado el runtime ni
redesplegado Render. Auto-Deploy se dejo en Off para que publicar archivos en
GitHub no recree el servicio antes de resolver el respaldo y la persistencia.

### Pasos antes de aplicar

1. Respaldar los datos del servicio remoto. El respaldo local es independiente y
   no garantiza conservar las cuentas o productos creados en la web publicada.
   El plan Free no incluye Shell, por lo que no se debe dar por hecho que el JSON
   remoto puede exportarse desde el dashboard.
2. Resolver la persistencia antes de usarlo para datos que deban conservarse.
   Manteniendo Free, seria necesario implementar una base externa y su migracion;
   el backend actual no admite PostgreSQL. El plan de base de datos debe revisarse
   por separado: no se incluye ni contrata automaticamente.
3. Mantener Auto-Deploy en Off mientras se publican los archivos nuevos en
   GitHub y hasta terminar el respaldo y la preparacion de persistencia.
4. En Settings > Build > Source > Edit, elegir el mismo repositorio y rama y
   cambiar Runtime a Docker. La propuesta Free usa `MONITOR_DB_PATH` en
   `/app/data/db.json`, sin disco persistente y solo para demostracion.
   No introducir comandos npm en los campos de Docker: se usa el CMD de la imagen.
5. Tras implementar persistencia, restaurar el respaldo remoto con acceso
   restringido, sin subir datos personales ni sesiones al repositorio Git.
6. Verificar despliegue Live, `/api/me`, login, productos, ejecucion automatica y
   persistencia despues de un reinicio. Verificar tambien la API desde Vercel.

No se debe cambiar el destino del proxy si se conserva la URL actual de Render.
Si se crea otro servicio con otra URL, actualizar el destino en `vercel.json`.
El JSON requiere una unica instancia de backend. Docker no elimina los limites
del plan Free: se suspende por inactividad y no incluye disco persistente.

Referencias oficiales:

- https://render.com/docs/native-runtimes#changing-a-services-runtime
- https://render.com/docs/disks
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://vercel.com/docs/project-configuration
