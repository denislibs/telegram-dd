// Original telegram-dd code (GPL-3.0-or-later). Prototype natives for app code that creates, walks or listens on
// nodes built from untrusted content (message text, usernames, link previews).
//
// A `<form>` (or `document`) with a child whose `id` / `name` equals a built-in (`<input name="insertBefore">`,
// `<img name="createElement">`) shadows that member on the instance (`[LegacyOverrideBuiltIns]`), so
// `node.insertBefore(…)` or `document.createElement(…)` throws or returns the element. The natives are captured
// once, on first use, from the prototypes and called with `.call(node, …)`. A method called through `.call` costs
// the same as a direct call; a getter read through `.call` is ~1.7x slower than a property read.
//
// The set is what the app uses; add a member when a caller needs it.
/* eslint-disable no-null/no-null -- the DOM signatures */
export interface Natives {
  parentNode: (this: Node) => Node | null;
  nextSibling: (this: Node) => ChildNode | null;
  insertBefore: <T extends Node>(this: Node, node: T, child: Node | null) => T;
  removeChild: <T extends Node>(this: Node, child: T) => T;
  createElement: Document['createElement'];
  addEventListener: EventTarget['addEventListener'];
  removeEventListener: EventTarget['removeEventListener'];
  /** `Element.prototype.querySelectorAll` (a form named `querySelectorAll` shadows it on the element). */
  querySelectorAll: Element['querySelectorAll'];
}
/* eslint-enable no-null/no-null */

let natives: Natives | undefined;

function getter<T>(proto: object, name: string): (this: Node) => T {
  return Object.getOwnPropertyDescriptor(proto, name)!.get as (this: Node) => T;
}

export function getNatives(): Natives {
  return (natives ??= {
    parentNode: getter<Node | null>(Node.prototype, 'parentNode'),
    nextSibling: getter<ChildNode | null>(Node.prototype, 'nextSibling'),
    insertBefore: Node.prototype.insertBefore,
    removeChild: Node.prototype.removeChild,
    createElement: Document.prototype.createElement,
    addEventListener: EventTarget.prototype.addEventListener,
    removeEventListener: EventTarget.prototype.removeEventListener,
    querySelectorAll: Element.prototype.querySelectorAll,
  });
}
