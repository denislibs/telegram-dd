// Deviation: a thin adapter over the kit's `<InfiniteScroll>` (src/lib/kit/infiniteScroll.ts) that keeps tt's props, so
// call sites keep `import InfiniteScroll from '../ui/InfiniteScroll'`. The kit owns the scroll anchoring and the loaders.
//
// Mapped: ref, className (-> class), style, items, itemSelector, preloadBackwards, sensitiveArea, noScrollRestore,
// noScrollRestoreOnTop, scrollContainerClosest (-> scrollContainer), onLoadMore, onScroll, onWheel, onClick, onKeyDown.
// `withAbsolutePositioning` turns the scroll restore off, as in tt. Not mapped: tt wraps the children of an absolutely
// positioned list in `<div style="position: relative">` with `teactFastList`; here the owner of the list renders that
// wrapper itself (the rows of a `<ManualFor>` must be the sole content of their slot, which a wrapper component that
// receives them as `children` would flatten away). `noFastList` and `cacheBuster` are accepted and ignored.
import { InfiniteScroll as KitInfiniteScroll } from '../../lib/kit';
import type { LoadMoreDirection } from '../../types';

export type OwnProps = {
  ref?: (el: HTMLDivElement) => void;
  style?: string;
  className?: string;
  items?: readonly unknown[];
  itemSelector?: string;
  preloadBackwards?: number;
  sensitiveArea?: number;
  withAbsolutePositioning?: boolean;
  maxHeight?: number;
  noScrollRestore?: boolean;
  noScrollRestoreOnTop?: boolean;
  noFastList?: boolean;
  cacheBuster?: unknown;
  beforeChildren?: unknown;
  scrollContainerClosest?: string;
  children?: unknown;
  onLoadMore?: ({ direction }: { direction: LoadMoreDirection; noScroll?: boolean }) => void;
  onScroll?: (e: Event) => void;
  onWheel?: (e: WheelEvent) => void;
  onClick?: (e: MouseEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
};

const InfiniteScroll = (props: OwnProps) => {
  return (
    <KitInfiniteScroll
      ref={(el) => props.ref?.(el)}
      class={props.className}
      style={props.style}
      items={props.items}
      itemSelector={props.itemSelector}
      preloadBackwards={props.preloadBackwards}
      sensitiveArea={props.sensitiveArea}
      noScrollRestore={props.noScrollRestore || props.withAbsolutePositioning}
      noScrollRestoreOnTop={props.noScrollRestoreOnTop}
      scrollContainer={props.scrollContainerClosest}
      onLoadMore={(args) =>
        props.onLoadMore?.({ direction: args.direction as LoadMoreDirection, noScroll: args.noScroll })
      }
      onScroll={(e) => props.onScroll?.(e)}
      onWheel={(e) => props.onWheel?.(e)}
      onClick={(e) => props.onClick?.(e)}
      onKeyDown={(e) => props.onKeyDown?.(e)}
    >
      {props.beforeChildren}
      {props.children}
    </KitInfiniteScroll>
  );
};

export default InfiniteScroll;
