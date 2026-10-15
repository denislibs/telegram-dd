// Original module (not in telegram-tt): the custom emoji id check that tt has only in the markdown path
// (`buildCustomEmojiMarkdownAttrs`), shared with the HTML paste and the custom emoji loader.
const DOCUMENT_ID_BITS = 64;
const RE_DOCUMENT_ID = /^-?\d+$/;

/** A document id is a signed 64-bit integer in decimal (the API's `long`, passed through `BigInt`) */
export default function isValidDocumentId(value: unknown): value is string {
  if (typeof value !== 'string' || !RE_DOCUMENT_ID.test(value)) return false;

  const numericValue = BigInt(value);
  return BigInt.asIntN(DOCUMENT_ID_BITS, numericValue) === numericValue;
}
