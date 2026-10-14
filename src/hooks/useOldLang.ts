import { onMount } from 'frameact';

import * as langProvider from '../util/oldLangProvider';
import useEffectOnce from './useEffectOnce';
import useForceUpdate from './useForceUpdate';

export type OldLangFn = langProvider.LangFn;
/**
 * @deprecated
 */
const useOldLang = (): OldLangFn => {
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  onMount(() => {
    return langProvider.addCallback(forceUpdate);
  });

  return langProvider.getTranslationFn();
};

export default useOldLang;
