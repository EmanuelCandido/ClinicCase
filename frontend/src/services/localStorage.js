// @ts-check

const STORAGE_VERSION = 1;
const MIGRATION_MARKER_PREFIX = 'pibic.storageMigration.v1';
const LEGACY_KEYS = [
  'pibic.caseDraft',
  'pibic.savedCase',
  'pibic.profileAvatar',
  'pibic.favoriteCases',
  'pibic.professorPreferences',
];

/**
 * @param {string} key
 * @param {string | number | null | undefined} idProfessor
 * @returns {string | null}
 */
export function professorStorageKey(key, idProfessor) {
  return idProfessor ? `${key}.${idProfessor}` : null;
}

/**
 * @template T
 * @param {string} key
 * @param {string | number | null | undefined} idProfessor
 * @param {T} fallback
 * @param {{ maxAgeMs?: number }} [options]
 * @returns {T}
 */
export function readProfessorStorage(key, idProfessor, fallback, options = {}) {
  const storageKey = professorStorageKey(key, idProfessor);
  if (!storageKey) return fallback;

  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return fallback;

    const parsed = JSON.parse(value);
    if (!isStorageEnvelope(parsed)) return /** @type {T} */ (parsed);

    const maxAgeMs = Number(options.maxAgeMs || 0);
    if (maxAgeMs > 0 && Date.now() - parsed.savedAt > maxAgeMs) {
      window.localStorage.removeItem(storageKey);
      return fallback;
    }

    return /** @type {T} */ (parsed.value);
  } catch {
    window.localStorage.removeItem(storageKey);
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string | number | null | undefined} idProfessor
 * @param {unknown} value
 */
export function writeProfessorStorage(key, idProfessor, value) {
  const storageKey = professorStorageKey(key, idProfessor);
  if (!storageKey) return false;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      value,
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 * @param {string | number | null | undefined} idProfessor
 */
export function removeProfessorStorage(key, idProfessor) {
  const storageKey = professorStorageKey(key, idProfessor);
  if (storageKey) window.localStorage.removeItem(storageKey);
}

/** @param {string | number | null | undefined} idProfessor */
export function migrateLegacyProfessorStorage(idProfessor) {
  if (!idProfessor) return;
  const marker = `${MIGRATION_MARKER_PREFIX}.${idProfessor}`;
  if (window.localStorage.getItem(marker)) return;

  let migrationComplete = true;

  LEGACY_KEYS.forEach((key) => {
    const legacyValue = window.localStorage.getItem(key);
    if (legacyValue === null) return;

    const targetKey = professorStorageKey(key, idProfessor);
    if (!targetKey) return;

    try {
      if (window.localStorage.getItem(targetKey) === null) {
        window.localStorage.setItem(targetKey, legacyValue);
      }
      window.localStorage.removeItem(key);
    } catch {
      migrationComplete = false;
    }
  });

  if (migrationComplete) {
    try {
      window.localStorage.setItem(marker, String(Date.now()));
    } catch {
      // Uma falha apenas no marcador não deve apagar dados nem interromper o app.
    }
  }
}

/**
 * @param {unknown} value
 * @returns {value is { version: number, savedAt: number, value: unknown }}
 */
function isStorageEnvelope(value) {
  const record = value && typeof value === 'object'
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
  return Boolean(
    record
    && record.version === STORAGE_VERSION
    && Number.isFinite(record.savedAt)
    && Object.prototype.hasOwnProperty.call(record, 'value'),
  );
}
