import { onMount } from 'frameact';

import { addLocalizationCallback, getTranslationFn, type LangFn } from '../util/localization';
import useEffectOnce from './useEffectOnce';
import useForceUpdate from './useForceUpdate';

const useLang = (): LangFn => {
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  onMount(() => {
    return addLocalizationCallback(forceUpdate);
  });

  return getTranslationFn();
};

export default useLang;
