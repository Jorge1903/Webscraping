# Scraping Monitor para Android

Cliente Android con Expo SDK 58 y React Native. Muestra la aplicación publicada en
https://webscraping-psi.vercel.app/ mediante WebView. Comparte usuarios, monitores
y datos con la web; el backend y PostgreSQL siguen en Render. Necesita internet,
pero no necesita Docker, Metro, Expo Go ni la laptop encendidos una vez instalado
el APK.

Incluye áreas seguras, botón Atrás, cookies de sesión persistentes, pantalla de
reintento y apertura de enlaces de tiendas en el navegador. La sesión conserva
la caducidad que define el servidor; no guarda contraseñas en el cliente.

## Desarrollo y validación

Desde esta carpeta:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npx.cmd expo-doctor
npx.cmd expo export --platform android --output-dir dist
npm.cmd start
```

El teléfono necesita acceso a los servicios publicados. `localhost` en el teléfono
es el teléfono, no la laptop. No se incluyen credenciales de PostgreSQL en la app.

## Generar un APK instalable

```powershell
npx.cmd eas-cli@latest login
npm.cmd run build:apk
```

Proyecto: https://expo.dev/accounts/jorge1903/projects/scraping-monitor

El perfil `preview` de `eas.json` genera un APK de lanzamiento firmado, con
distribución interna y sin servidor de desarrollo. EAS conserva la llave de
firma para que las siguientes versiones puedan actualizar la instalación.
El identificador es `com.jorge1903.scrapingmonitor`. Conserva la misma cuenta,
proyecto e identificador para futuras versiones. No publiques las llaves.

Al terminar, abre el enlace de instalación de Expo en Android, descarga el APK
y permite a ese navegador instalar la aplicación si Android lo solicita.
El perfil `production` genera un AAB para una futura publicación en Google Play;
no es el archivo para instalación directa.

`.easignore` en la raíz del repositorio limita la subida a `mobile/`, excluye
dependencias, archivos generados, llaves y variables. Puedes revisar el paquete:

```powershell
npx.cmd eas-cli@latest build:inspect -p android -s archive -e preview -o ../data/apk-build-review
```

Los cambios de la web se reflejan al abrir la app. Para cambiar el contenedor,
icono, URL o permisos, genera e instala un APK nuevo. El APK no agrega ejecución
en segundo plano ni notificaciones push: las revisiones las ejecuta el backend.
Render Free conserva sus límites de suspensión y PostgreSQL Free su vencimiento;
crear el APK no modifica esos límites.
