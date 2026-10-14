import type { JSX } from 'frameact/jsx-runtime';

// Deviation: frameact JSX already evaluates to DOM nodes, so there is nothing to render into a detached container.
export default function jsxToHtml(jsx: JSX.Element) {
  const nodes: unknown[] = Array.isArray(jsx) ? jsx : [jsx];
  return nodes.filter((node): node is Element => node instanceof Element);
}
