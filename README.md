# Scraping Monitor

Aplicacion React + Node para registrar productos y revisarlos cada 5 minutos. Guarda usuarios, sesiones, monitoreos e historial local en `data/db.json`. El servidor debe permanecer encendido para hacer las revisiones; el navegador puede cerrarse.

La idea es funcionar como una base estilo Keepa: cada revision guarda precio, nombre e imagen; el panel muestra historial, minimo, promedio, maximo y una alerta visual cuando el precio cae por debajo del objetivo.

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
