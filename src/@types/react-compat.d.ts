// telegram-tt types its event handlers and children with React's names (`React.MouseEvent<T>`, `React.ReactNode`,
// `import type { ChangeEvent } from 'react'`), resolved by teact's `@types/react` dependency. frameact delivers native
// DOM events (with `currentTarget` typed) and `JSX.Element` children, so these aliases let ported files keep tt's
// annotations unchanged (porting guide §7.3: smaller diffs against the reference). No React code is involved.
type WithTarget<E extends Event, T> = E & { readonly currentTarget: T; readonly target: EventTarget | null };

declare namespace React {
  type ReactNode = import('frameact/jsx-runtime').JSX.Element;
  type AriaRole = string;
  type CSSProperties = string;

  type SyntheticEvent<T = Element, E extends Event = Event> = WithTarget<E, T>;
  type UIEvent<T = Element, E extends globalThis.UIEvent = globalThis.UIEvent> = WithTarget<E, T>;
  type MouseEvent<T = Element, E extends globalThis.MouseEvent = globalThis.MouseEvent> = WithTarget<E, T>;
  type PointerEvent<T = Element, E extends globalThis.PointerEvent = globalThis.PointerEvent> = WithTarget<E, T>;
  type TouchEvent<T = Element, E extends globalThis.TouchEvent = globalThis.TouchEvent> = WithTarget<E, T>;
  type WheelEvent<T = Element, E extends globalThis.WheelEvent = globalThis.WheelEvent> = WithTarget<E, T>;
  type DragEvent<T = Element, E extends globalThis.DragEvent = globalThis.DragEvent> = WithTarget<E, T>;
  type KeyboardEvent<T = Element, E extends globalThis.KeyboardEvent = globalThis.KeyboardEvent> = WithTarget<E, T>;
  type FocusEvent<T = Element, E extends globalThis.FocusEvent = globalThis.FocusEvent> = WithTarget<E, T>;
  type ClipboardEvent<T = Element, E extends globalThis.ClipboardEvent = globalThis.ClipboardEvent> = WithTarget<E, T>;
  type AnimationEvent<T = Element, E extends globalThis.AnimationEvent = globalThis.AnimationEvent> = WithTarget<E, T>;
  type TransitionEvent<T = Element, E extends globalThis.TransitionEvent = globalThis.TransitionEvent> = WithTarget<
    E,
    T
  >;
  type FormEvent<T = Element, E extends Event = Event> = WithTarget<E, T>;
  type ChangeEvent<T = Element, E extends Event = Event> = WithTarget<E, T>;

  type MouseEventHandler<T = Element> = (event: MouseEvent<T>) => void;
  type KeyboardEventHandler<T = Element> = (event: KeyboardEvent<T>) => void;
  type EffectCallback = () => void | (() => void);

  /** A teact ref object. Ported code holds elements in `let` variables; this only keeps old prop types compiling. */
  interface RefObject<T> {
    current: T | undefined;
  }
}

declare module 'react' {
  export type ReactNode = React.ReactNode;
  export type AriaRole = React.AriaRole;
  export type SyntheticEvent<T = Element, E extends Event = Event> = React.SyntheticEvent<T, E>;
  export type MouseEvent<T = Element, E extends globalThis.MouseEvent = globalThis.MouseEvent> = React.MouseEvent<T, E>;
  export type KeyboardEvent<
    T = Element,
    E extends globalThis.KeyboardEvent = globalThis.KeyboardEvent,
  > = React.KeyboardEvent<T, E>;
  export type FocusEvent<T = Element, E extends globalThis.FocusEvent = globalThis.FocusEvent> = React.FocusEvent<T, E>;
  export type FormEvent<T = Element, E extends Event = Event> = React.FormEvent<T, E>;
  export type ChangeEvent<T = Element, E extends Event = Event> = React.ChangeEvent<T, E>;
  export type MouseEventHandler<T = Element> = React.MouseEventHandler<T>;
  export type RefObject<T> = React.RefObject<T>;
}
