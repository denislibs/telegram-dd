import { createMemo } from 'frameact';

import type { MaybeAccessor } from '../../util/accessors';

import { prepareHexColor } from '../../util/themeStyle';
import useStyleObserver from '../element/useStyleObserver';

const DEBOUNCE = 50; // ms

// Style observer that returns hex color value of the property
export default function useDynamicColorListener(
  ref: MaybeAccessor<HTMLElement | undefined>,
  property: MaybeAccessor<string> = 'color',
  isDisabled?: MaybeAccessor<boolean | undefined>,
) {
  const value = useStyleObserver(ref, property, DEBOUNCE, isDisabled);
  const hexColor = createMemo(() => {
    const value2 = value();
    return value2 ? prepareHexColor(value2) : undefined;
  });

  return hexColor;
}
