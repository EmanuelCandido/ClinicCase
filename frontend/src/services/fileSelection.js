export function normalizeSelectedFile(file) {
  if (typeof file === 'string') {
    return { lastModified: 0, name: file, size: null, type: '' };
  }

  const hasSize = file?.size !== null && file?.size !== undefined && file?.size !== '';
  return {
    lastModified: Number(file?.lastModified || 0),
    name: String(file?.name || 'Arquivo sem nome'),
    size: hasSize && Number.isFinite(Number(file.size)) ? Number(file.size) : null,
    type: String(file?.type || ''),
  };
}

export function mergeSelectedFiles(currentFiles, selectedFiles) {
  const merged = new Map();
  [...(currentFiles || []), ...(selectedFiles || [])].forEach((file) => {
    const normalized = normalizeSelectedFile(file);
    merged.set(selectedFileKey(normalized), normalized);
  });
  return [...merged.values()];
}

export function selectedFileKey(file) {
  const normalized = normalizeSelectedFile(file);
  return `${normalized.name}:${normalized.size ?? 'unknown'}:${normalized.lastModified}`;
}

export function formatFileSize(size) {
  if (size === null || size === undefined || size === '') return '';
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
