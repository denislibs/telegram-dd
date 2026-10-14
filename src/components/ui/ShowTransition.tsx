// Deviation: a thin adapter over the kit's `<ShowTransition>` (src/lib/kit/showTransition.ts) that keeps tt's props.
// Mapped: isOpen, isCustom, isHidden, id, className (-> class), onClick, noCloseTransition, shouldAnimateFirstRender,
// style, ref, children. The children stay mounted while the element closes (tt keeps a copy of the previous children).
import { ShowTransition as KitShowTransition } from '../../lib/kit';

export type OwnProps = {
  isOpen: boolean;
  isCustom?: boolean;
  isHidden?: boolean;
  id?: string;
  className?: string;
  onClick?: (e: MouseEvent) => void;
  noCloseTransition?: boolean;
  shouldAnimateFirstRender?: boolean;
  style?: string;
  children?: unknown;
  ref?: (el: HTMLDivElement) => void;
};

const ShowTransition = (props: OwnProps) => {
  return (
    <KitShowTransition
      isOpen={props.isOpen}
      isCustom={props.isCustom}
      isHidden={props.isHidden}
      id={props.id}
      class={props.className}
      onClick={(e) => props.onClick?.(e)}
      noCloseTransition={props.noCloseTransition}
      shouldAnimateFirstRender={props.shouldAnimateFirstRender}
      style={props.style}
      ref={(el) => props.ref?.(el)}
    >
      {props.children}
    </KitShowTransition>
  );
};

export default ShowTransition;
