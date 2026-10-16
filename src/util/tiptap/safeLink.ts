// Original module (not in telegram-tt): the link address checks that the composer and the copy path share.
import { formatLinkUrl, isValidProtocol } from '../browser/url';

// The schemes a link of the composer or of the clipboard may keep: the ones the message view opens (`ensureProtocol`)
export const SAFE_LINK_PROTOCOLS = ['http', 'https', 'tg', 'ton', 'mailto', 'tel'];

const RE_URL_SCHEME = /^([a-z][a-z\d+.-]*):/i;
// An address without a scheme must start like a domain (`example.com/a`), not like a relative or protocol-relative
// reference (`/a`, `//host/a`, `#a`, `?a`, `./a`, `\a`)
const RE_BARE_ADDRESS_START = /^[\p{L}\p{N}]/u;
// What the URL parser ignores at the ends of an address and inside it
const RE_URL_EDGE_CONTROLS = /^[\0-\x20]+|[\0-\x20]+$/g;
const RE_URL_TAB_OR_NEWLINE = /[\t\n\r]/g;
// Whitespace and default-ignorable characters (zero-width spaces and joiners, word joiner, BOM, ...)
const RE_INVISIBLE = /[\s\p{Default_Ignorable_Code_Point}]/gu;
// Characters that end or break a markdown link destination
const RE_MARKDOWN_DESTINATION_UNSAFE = /[\s\p{Cc}()<>"\\]/gu;

/**
 * Deviation (security): tt accepts a pasted link address (and a pasted button URL) as it is, so `ftp:`, `sms:`, `cid:`,
 * relative and protocol-relative addresses were sent as text links. The address goes through the link modal's
 * normalisation (`formatLinkUrl` = `ensureProtocol` + `encodeURI`) and must then have one of `SAFE_LINK_PROTOCOLS`.
 * An explicit other scheme, or an address that does not start like a domain, gives `undefined`.
 */
export function normalizeSafeLinkUrl(value: unknown) {
  if (typeof value !== 'string') return undefined;

  const address = value.replace(RE_URL_TAB_OR_NEWLINE, '').replace(RE_URL_EDGE_CONTROLS, '');
  if (!address) return undefined;

  const scheme = address.match(RE_URL_SCHEME)?.[1];
  if (scheme ? !SAFE_LINK_PROTOCOLS.includes(scheme.toLowerCase()) : !RE_BARE_ADDRESS_START.test(address)) {
    return undefined;
  }

  const href = formatLinkUrl(address);
  return isValidProtocol(href, SAFE_LINK_PROTOCOLS) ? href : undefined;
}

/** Whether the text of a link shows anything: a link over whitespace or zero-width characters only is invisible */
export function hasVisibleLinkText(text: string) {
  return text.replace(RE_INVISIBLE, '').length > 0;
}

/**
 * Deviation (security): tiptap's markdown serialiser writes a link as `[text](href)` with the address as it is, so a
 * `)` (or a space, `<`, `"`) in the address of a received text link ended the link and the rest of the address became
 * markdown of its own (a second link, raw HTML). These characters are percent-encoded in the markdown flavour only;
 * a valid address keeps its meaning and stays byte-identical otherwise. `new URL(href).href` alone is not enough: an
 * opaque path (`mailto:a b<c>(d)`) keeps them.
 */
export function encodeMarkdownLinkDestination(href: string) {
  return href.replace(RE_MARKDOWN_DESTINATION_UNSAFE, (character) => {
    const encoded = encodeURIComponent(character);
    return encoded !== character ? encoded : `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;
  });
}
