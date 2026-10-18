const MAX_HTML_BYTES = 3 * 1024 * 1024;

export async function readHtmlResponse(response) {
  if (Number(response.headers.get('content-length')) > MAX_HTML_BYTES) {
    await response.body?.cancel();
    throw new Error('La página es demasiado grande para procesarla. Prueba con el enlace directo del producto.');
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new Error('La página es demasiado grande para procesarla. Prueba con el enlace directo del producto.');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, length).toString('utf8');
  } finally { reader.releaseLock(); }
}
