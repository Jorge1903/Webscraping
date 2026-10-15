export function fieldRecognized(field, data) {
  if (!data) return false;
  if (['pagePreview', 'sourceUrl', 'checkedAt'].includes(field.key)) return Boolean(data[field.previewKey]);
  if (['price', 'history'].includes(field.key)) return data.priceValue != null;
  const value = data[field.previewKey];
  return Boolean(value && !/no detectado/i.test(String(value)));
}

export function recognizedSelection(fields, data, overrides = {}) {
  return fields.filter(field => overrides[field.key] ?? fieldRecognized(field, data)).map(field => field.key);
}
