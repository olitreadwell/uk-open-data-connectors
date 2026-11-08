const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

/**
 * Decodes the entities that appear in XML and HTML payloads.
 *
 * The feeds in this package carry named entities and numeric character
 * references. Unknown entities are left as written, so a payload is never
 * silently changed beyond the references this function knows.
 *
 * @param text - text that may hold entities
 * @returns text with the known entities decoded
 */
export function decodeMarkupEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (body.startsWith('#')) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/**
 * Turns an XML or HTML fragment into plain text.
 *
 * @param markup - an XML or HTML fragment
 * @returns the text inside the fragment, with runs of whitespace collapsed
 */
export function stripMarkup(markup: string): string {
  return decodeMarkupEntities(markup.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}
