import type { JSX } from 'frameact/jsx-runtime';
import type { Element, Root } from 'hast';
import { createLowlight } from 'lowlight';

import { createCallbackManager } from './callbacks';
import { getCodeLanguageName } from './codeLanguages';

const THIRD_PARTY_LANGUAGES = ['typelanguage'];
export const CODE_HIGHLIGHTING_CHANGED_META = 'codeHighlightingChanged';

// Deviation: tt reads the grammars of highlight.js from the hoisted `node_modules/highlight.js`. highlight.js is a
// dependency of `lowlight` only, so with pnpm that path does not exist and no language would ever load: the second
// pattern is where pnpm keeps it. (A direct dependency on highlight.js would make the first one enough.)
const LANGUAGE_MODULES = import.meta.glob([
  '../../node_modules/highlight.js/es/languages/*.js',
  '/node_modules/.pnpm/highlight.js@*/node_modules/highlight.js/es/languages/*.js',
]) as Record<string, () => Promise<{ default: any }>>;

const {
  addCallback: subscribeToCodeLanguageLoad,
  runCallbacks: runLanguageLoadCallbacks,
} = createCallbackManager<NoneToVoidFunction>();
const languagePromises = new Map<string, Promise<any>>();
export const lowlight = createLowlight({});
export { subscribeToCodeLanguageLoad };

export function requestCodeBlockHighlightRefresh() {
  runLanguageLoadCallbacks();
}

export default async function highlightCode(text: string, language: string) {
  const lowLang = language.toLowerCase();
  const langCode = getCodeLanguageName(lowLang);
  if (!langCode) return undefined;

  const result = await ensureCodeLanguage(langCode);
  if (!result) return undefined;
  const tree = lowlight.highlight(langCode, text);
  return treeToElements(tree);
}

export async function ensureCodeLanguage(language: string) {
  if (lowlight.registered(language)) {
    return true;
  }

  const langCode = getCodeLanguageName(language);
  if (!langCode) {
    return false;
  }

  if (languagePromises.has(langCode)) {
    await languagePromises.get(langCode);
    return true;
  }

  const languagePromise = THIRD_PARTY_LANGUAGES.includes(langCode)
    ? loadThirdPartyLanguage(langCode) : loadFirstPartyLanguage(langCode);
  if (!languagePromise) return false;

  const syntax = await languagePromise;
  lowlight.register(langCode, syntax.default);
  if (langCode === '1c') {
    lowlight.registerAlias('1c', '1с'); // Allow cyrillic
  }
  notifyLanguageLoad();
  return true;
}

function notifyLanguageLoad() {
  runLanguageLoadCallbacks();
}

function loadFirstPartyLanguage(langCode: string) {
  const languageModulePath = Object.keys(LANGUAGE_MODULES).find((path) => path.endsWith(`/es/languages/${langCode}.js`));
  const loadLanguageModule = languageModulePath && LANGUAGE_MODULES[languageModulePath];
  if (!loadLanguageModule) return undefined;

  const languagePromise = loadLanguageModule();
  languagePromises.set(langCode, languagePromise);
  return languagePromise;
}

function loadThirdPartyLanguage(langCode: string) {
  if (langCode === 'typelanguage') {
    const langPromise = import('../lib/hljs-tl/typelanguage');
    languagePromises.set(langCode, langPromise);
    return langPromise;
  }
  return undefined;
}

// Deviation: teact's `createElement` calls became DOM nodes built here (this is a `.ts` file, no JSX); the text of the
// code only ever goes into text nodes (`append` of a string), never into markup.
function treeToElements(tree: Element | Root): JSX.Element {
  const children = tree.children.map((child) => {
    if (child.type === 'text') {
      return child.value;
    }
    if (child.type === 'element') {
      return treeToElements(child);
    }
    return undefined;
  }).filter(Boolean) as (Node | string)[];

  if (tree.type === 'root') {
    const code = document.createElement('code');
    code.className = 'hljs custom-scroll-x';
    code.append(...children);
    return code;
  }

  // Deviation: lowlight emits `span` only; the tag name of the tree is not used to create an element
  const span = document.createElement('span');
  const classNameArray = tree.properties?.className;
  const className = classNameArray?.join(' ');
  if (className) span.className = className;
  span.append(...children);
  return span;
}
