import * as langProvider from '../util/oldLangProvider';
import { createReactiveCallable } from '../util/reactiveCallable';

export type OldLangFn = langProvider.LangFn;

// Deviation: see hooks/useLang.ts.
const reactiveOldLang = createReactiveCallable<OldLangFn>(langProvider.getTranslationFn, langProvider.addCallback);

/**
 * @deprecated
 */
const useOldLang = (): OldLangFn => {
  return reactiveOldLang;
};

export default useOldLang;
