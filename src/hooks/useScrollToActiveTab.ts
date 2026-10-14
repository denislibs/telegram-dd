import { createMeasureEffect } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import animateHorizontalScroll from '../util/animateHorizontalScroll';
import { depsOf } from '../util/effectDeps';

const TAB_SCROLL_THRESHOLD_PX = 16;
const SCROLL_DURATION = 300;

export default function useScrollToActiveTab(
  containerRef: MaybeAccessor<HTMLDivElement | undefined>,
  activeTab: MaybeAccessor<number>,
) {
  createMeasureEffect(
    depsOf(() => [read(activeTab), read(containerRef)] as const),
    ([activeTab2, container]) => {
      if (!container) return;

      const { scrollWidth, offsetWidth, scrollLeft } = container;
      if (scrollWidth <= offsetWidth) return;

      const activeTabElement = container.childNodes[activeTab2] as HTMLElement | undefined;
      if (!activeTabElement) return;

      const { offsetLeft, offsetWidth: tabWidth } = activeTabElement;
      const newLeft = offsetLeft - offsetWidth / 2 + tabWidth / 2;

      if (Math.abs(newLeft - scrollLeft) < TAB_SCROLL_THRESHOLD_PX) return;

      animateHorizontalScroll(container, newLeft, SCROLL_DURATION);
    },
  );
}
