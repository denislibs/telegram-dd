import { requestMutation } from 'frameact';

import { SVG_NAMESPACE } from '../config';
import generateUniqueId from './generateUniqueId';

const DEFINITION_MAP = new Map<string, Element>();

let defs: SVGElement | undefined;

function init() {
  if (defs) return;

  const container = document.createElementNS(SVG_NAMESPACE, 'svg');
  container.setAttribute('width', '0');
  container.setAttribute('height', '0');
  container.setAttribute('viewBox', '0 0 1 1');
  container.classList.add('svg-definitions');
  document.body.appendChild(container);

  defs = document.createElementNS(SVG_NAMESPACE, 'defs');
  container.appendChild(defs);
}

function appendElement(element: Element) {
  requestMutation(() => {
    if (!defs) init();
    defs!.appendChild(element);
  });
}

// Deviation: frameact JSX is a DOM element already, so the element is taken as it is and its `id` is set on the node.
export function addSvgDefinition(element: Element, id?: string) {
  id ??= generateUniqueId();
  element.id = id;

  DEFINITION_MAP.set(id, element);
  appendElement(element);
  return id;
}

export function removeSvgDefinition(id: string) {
  const element = DEFINITION_MAP.get(id);
  if (element) {
    requestMutation(() => {
      element.remove();
    });
    DEFINITION_MAP.delete(id);
  }
}
