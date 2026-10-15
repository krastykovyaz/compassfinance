// A deliberately tiny XML reader for the one shape Interactive Brokers'
// Flex Web Service produces: flat elements whose data lives in ATTRIBUTES
// (<OpenPosition conid="265598" position="10" .../>), plus the three-line
// <FlexStatementResponse> status envelope, whose data lives in element
// text. No DOCTYPE, entity declarations, CDATA, namespaces or mixed
// content are ever produced, and none are interpreted here: this scans for
// start tags and decodes the five predefined entities and numeric
// references, nothing more. That is also why it cannot be tricked into
// entity expansion or external fetches.
//
// Pulled in-house instead of adding an XML dependency because the format
// is this regular and a dependency would also have to be reviewed, locked
// and shipped for it.

export type XmlElement = { name: string; attrs: Record<string, string> };

const START_TAG = /<([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x")) return safeCodePoint(parseInt(body.slice(2), 16), whole);
    if (body.startsWith("#")) return safeCodePoint(parseInt(body.slice(1), 10), whole);
    return NAMED_ENTITIES[body] ?? whole;
  });
}

function safeCodePoint(code: number, fallback: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Every start/self-closing tag in document order, with decoded
 * attributes. Closing tags, comments and processing instructions are
 * skipped by the pattern itself. */
export function scanElements(xml: string): XmlElement[] {
  const elements: XmlElement[] = [];
  START_TAG.lastIndex = 0;
  let tag: RegExpExecArray | null;
  while ((tag = START_TAG.exec(xml)) !== null) {
    const attrs: Record<string, string> = {};
    const rawAttrs = tag[2];
    if (rawAttrs) {
      ATTRIBUTE.lastIndex = 0;
      let attr: RegExpExecArray | null;
      while ((attr = ATTRIBUTE.exec(rawAttrs)) !== null) {
        attrs[attr[1]] = decodeXmlEntities(attr[2] ?? attr[3] ?? "");
      }
    }
    elements.push({ name: tag[1], attrs });
  }
  return elements;
}

/** Text of the first <tag>text</tag>, or null. For the status envelope. */
export function firstElementText(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return match ? decodeXmlEntities(match[1]).trim() : null;
}
