import { useEffect, useState } from 'react';
import { api } from './api.js';

export function usePagePreview(url) {
  const [state, setState] = useState({ html: '', loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ html: '', loading: true, error: '' });
    api(`/api/page-preview?url=${encodeURIComponent(url)}`, { responseType: 'text', signal: controller.signal })
      .then(html => { if (!controller.signal.aborted) setState({ html, loading: false, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ html: '', loading: false, error: error.message }); });
    return () => controller.abort();
  }, [url, revision]);
  return { ...state, retry: () => setRevision(value => value + 1) };
}
