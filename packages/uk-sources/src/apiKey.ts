/**
 * Normalizes an optional API key read from configuration or a caller.
 *
 * An environment variable that is set but empty is treated as absent, so a
 * blank key never reaches a request as an empty query parameter or header.
 *
 * @param key - The raw key, or undefined when unset.
 * @returns The trimmed key, or undefined when it is blank.
 */
export function normalizeSourceApiKey(key: string | undefined): string | undefined {
  const trimmed = key?.trim();
  if (trimmed === undefined || trimmed === '') {
    return undefined;
  }
  return trimmed;
}
