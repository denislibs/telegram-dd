import { Dynamic } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import { useTeactNodeViewContext } from './TeactNodeViewContext';

type OwnProps = {
  as?: 'div' | 'pre' | 'span';
  className?: string;
  placeholder?: string;
  contentEditable?: boolean;
  children?: JSX.Element;
};

const DEFAULT_ELEMENT_TAG = 'div';

const NodeViewContent = (props: OwnProps) => {
  const { contentDOMElement } = useTeactNodeViewContext();

  // Deviation: the ProseMirror content element is moved into this element once it is attached (tt did the same from a
  // ref callback); frameact never touches nodes it did not create.
  function handleElementRef(element?: HTMLElement) {
    if (!element || !contentDOMElement || contentDOMElement.parentElement === element) {
      return;
    }

    element.appendChild(contentDOMElement);
  }

  return (
    <Dynamic
      component={props.as ?? DEFAULT_ELEMENT_TAG}
      class={props.className}
      // Deviation: `contenteditable` is an attribute with a string value, and frameact removes an attribute set to
      // `false` (it would not be written at all), so the boolean prop is turned into the string here.
      contenteditable={props.contentEditable === undefined ? undefined : String(props.contentEditable)}
      ref={handleElementRef}
      data-node-view-content=""
      data-placeholder={props.placeholder}
    >
      {props.children}
    </Dynamic>
  );
};

export default NodeViewContent;
