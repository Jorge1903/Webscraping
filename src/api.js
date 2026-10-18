const temporaryStatuses = new Set([502, 503, 504]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function api(path, options = {}) {
  const { responseType = 'json', ...requestOptions } = options;
  const method = options.method || 'GET';
  const attempts = method === 'GET' ? 5 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(path, {
        ...requestOptions,
        credentials: 'include',
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(method === 'GET' ? 20000 : 60000)])
          : AbortSignal.timeout(method === 'GET' ? 20000 : 60000),
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      if (temporaryStatuses.has(response.status) && attempt < attempts - 1) {
        await response.body?.cancel();
        await pause(Math.min(2000 * 2 ** attempt, 8000));
        continue;
      }
      const payload = response.ok && responseType === 'text'
        ? await response.text() : await response.json().catch(() => null);
      if (!response.ok || !payload) {
        const error = new Error(payload?.error || (temporaryStatuses.has(response.status)
          ? 'El servidor está iniciando o temporalmente no disponible. Reintenta en un momento.'
          : 'No se pudo completar la solicitud.'));
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      // Mutations are never retried: the server may already have saved them.
      if (!error.status && attempt < attempts - 1 && !options.signal?.aborted) {
        await pause(Math.min(2000 * 2 ** attempt, 8000));
        continue;
      }
      if (!error.status) error.message = 'No se pudo conectar con el servidor. Espera un momento y vuelve a intentarlo.';
      throw error;
    }
  }
}
