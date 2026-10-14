import { createMeasureEffect } from 'frameact';
import { depsOf } from '../util/effectDeps';

import animateHorizontalScroll from '../util/animateHorizontalScroll';

const TAB_SCROLL_THRESHOLD_PX = 16;
const SCROLL_DURATION = 300;

// TODO(codemod): useScrollToActiveTab: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useScrollToActiveTab(containerRef: (el: HTMLDivElement) => void, activeTab: number) {
  createMeasureEffect(
    depsOf(() => [activeTab, containerRef]),
    () => {
      const container = containerRef.current;
      if (!container) return;

      const { scrollWidth, offsetWidth, scrollLeft } = container;
      if (scrollWidth <= offsetWidth) return;

      const activeTabElement = container.childNodes[activeTab] as HTMLElement | undefined;
      if (!activeTabElement) return;

      const { offsetLeft, offsetWidth: tabWidth } = activeTabElement;
      const newLeft = offsetLeft - offsetWidth / 2 + tabWidth / 2;

      if (Math.abs(newLeft - scrollLeft) < TAB_SCROLL_THRESHOLD_PX) return;

      animateHorizontalScroll(container, newLeft, SCROLL_DURATION);
    },
  );
}
