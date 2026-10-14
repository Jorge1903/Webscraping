# Scraping Monitor

Aplicacion React + Node para registrar productos y revisarlos cada 5, 10 o 30 minutos. Guarda usuarios, sesiones, monitoreos e historial local en `data/db.json`.

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
3. Usa "Detectar" para traer nombre, precio, moneda, imagen y descripcion cuando la tienda los publique en el HTML.
4. Elige el intervalo: 5, 10 o 30 minutos.
5. Opcionalmente agrega una alerta de precio, por ejemplo `1299`.
6. Si la pagina no entrega datos limpios, agrega selectores CSS para nombre, precio e imagen.
7. Usa "Revisar ahora" para probar el producto inmediatamente.

## Extraccion HTML

La app intenta leer `JSON-LD`, metadatos Open Graph, Twitter cards, `<title>` y selectores CSS desde el HTML que responde la pagina. La vista previa usa el mismo extractor que el monitoreo, asi que sirve para confirmar que el link esta entregando datos antes de guardarlo.

## Nota importante

React solo no puede hacer scraping confiable de otros dominios por CORS y por restricciones de los navegadores. Por eso esta app incluye un backend Node que hace las consultas.

Si un producto de Amazon, Mercado Libre u otra tienda muestra error de conexion o bloqueo, no significa que el formulario este roto. Significa que esa tienda no entrego el HTML al servidor local o lo cargo con JavaScript despues de abrir la pagina.
