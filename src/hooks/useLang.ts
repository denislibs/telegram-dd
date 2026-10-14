import { addLocalizationCallback, getTranslationFn, type LangFn } from '../util/localization';
import { createReactiveCallable } from '../util/reactiveCallable';

// Deviation: a component runs once, so there is no per-component `forceUpdate`. One module-level function object
// follows the localization callbacks through a signal (util/reactiveCallable.ts): `lang('Key')` in JSX is reactive.
const reactiveLang = createReactiveCallable<LangFn>(getTranslationFn, addLocalizationCallback);

const useLang = (): LangFn => {
  return reactiveLang;
};

export default useLang;
