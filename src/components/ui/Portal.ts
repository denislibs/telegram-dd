// Deviation: a thin adapter over frameact's `<Portal mount>` that keeps tt's props (`containerSelector`,
// `containerElement`, `className`) and tt's DOM shape (the content sits in a wrapper `div` appended to the container,
// `#portals` by default), so stylesheets and call sites stay as in tt.
import { createMutationEffect } from 'frameact';
import { createComponent, insert, Portal as FrameactPortal } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import { getNatives } from '../../util/dom/natives';

type OwnProps = {
  containerSelector?: string;
  containerElement?: HTMLElement;
  className?: string;
  children: JSX.Element;
};

const Portal = (props: OwnProps) => {
  const element = getNatives().createElement.call(document, 'div') as HTMLDivElement;

  // Assigning the whole string also drops the classes of a previous value. The element is detached at creation (the
  // first apply is synchronous), later runs are in the mutate phase.
  createMutationEffect(
    () => props.className || '',
    (className) => {
      element.className = className;
    },
  );
  insert(element, () => props.children);

  return createComponent(FrameactPortal, {
    // A new container adopts the content (frameact moves it with the mount).
    // Deviation: tt rendered nothing when the container is missing; frameact's Portal falls back to `document.body`.
    get mount() {
      return props.containerElement || document.querySelector<HTMLDivElement>(props.containerSelector || '#portals') || undefined;
    },
    children: element,
  });
};

export default Portal;
