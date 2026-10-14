import { expect, it } from 'vitest';

import { getNatives } from './natives';

function shadowed(...names: string[]): HTMLFormElement {
  const form = document.createElement('form');
  const img = document.createElement('img');
  form.append(img);
  for (const name of names) {
    Object.defineProperty(form, name, { value: img, writable: false, enumerable: false, configurable: true });
  }
  return form;
}

it('walks, edits and queries a <form> whose built-ins are shadowed, and creates elements on a shadowed document', () => {
  const natives = getNatives();
  expect(getNatives()).toBe(natives);
  const form = shadowed('parentNode', 'nextSibling', 'insertBefore', 'removeChild', 'querySelectorAll');
  const host = document.createElement('div');
  host.append(form);
  const item = document.createElement('i');
  item.className = 'x';
  natives.insertBefore.call(host, item, form);
  expect(natives.parentNode.call(form)).toBe(host);
  expect(natives.nextSibling.call(item)).toBe(form);
  expect(natives.querySelectorAll.call(host, '.x')[0]).toBe(item);
  natives.removeChild.call(host, item);
  expect(host.children.length).toBe(1);

  Object.defineProperty(document, 'createElement', { value: form, configurable: true });
  try {
    expect(natives.createElement.call(document, 'section').localName).toBe('section');
  } finally {
    delete (document as unknown as Record<string, unknown>).createElement;
  }
});
