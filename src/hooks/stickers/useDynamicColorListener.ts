import { createMemo } from 'frameact';

import { prepareHexColor } from '../../util/themeStyle';
import useStyleObserver from '../element/useStyleObserver';

const DEBOUNCE = 50; // ms

// Style observer that returns hex color value of the property
// TODO(codemod): useDynamicColorListener: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useDynamicColorListener(
  ref: (el: HTMLElement) => void,
  property = 'color',
  isDisabled?: boolean,
) {
  const value = useStyleObserver(ref, property, DEBOUNCE, isDisabled);
  const hexColor = createMemo(() => (value ? prepareHexColor(value) : undefined));

  return hexColor;
}
