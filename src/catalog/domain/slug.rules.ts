/** Id of a new item: lowercase, diacritics stripped, dash-separated. */
export function slugify(name: string, fallback: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/**
 * The ids to try for a new item: `base`, `base-2`, `base-3`... without end.
 * Which one is free is for the store to decide, atomically.
 */
export function* slugCandidates(base: string): Generator<string, never> {
  yield base;
  for (let attempt = 2; ; attempt++) {
    yield `${base}-${attempt}`;
  }
}
