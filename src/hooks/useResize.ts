import { createEffect, createMeasureEffect, createSignal, frameMutation, requestMutation } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';
import useFlag from './useFlag';

// Deviation: `elementRef` is an accessor of the element (`() => el`), `initialWidth` a `MaybeAccessor`; `onResize` and
// `onReset` are plain callbacks read when called.
export function useResize(
  elementRef: () => HTMLElement | undefined,
  onResize: (width: number) => void,
  onReset: NoneToVoidFunction,
  initialWidth?: MaybeAccessor<number | undefined>,
  cssPropertyName?: string,
) {
  const [isActive, markIsActive, unmarkIsActive] = useFlag();
  const [initialMouseX, setInitialMouseX] = createSignal<number>(0);
  const [initialElementWidth, setInitialElementWidth] = createSignal<number>(0);

  const setElementStyle = (width?: number) => {
    requestMutation(() => {
      const element = elementRef();
      if (!element) {
        return;
      }

      const widthPx = width ? `${width}px` : '';
      element.style.width = widthPx;
      if (cssPropertyName) {
        element.style.setProperty(cssPropertyName, widthPx);
      }
    });
  };

  // Apply directly instead of via `requestMutation` to avoid a one-frame delay
  // (layout effects already run in the mutation phase)
  // Deviation: `createEffect(..., frameMutation)`: the element is assigned after the body ran, and a
  // `createMutationEffect` would apply at creation, before the ref is set.
  createEffect(
    () => read(initialWidth),
    (initialWidth2) => {
      const element = elementRef();
      if (!element || !initialWidth2) {
        return;
      }

      const widthPx = `${initialWidth2}px`;
      element.style.width = widthPx;
      if (cssPropertyName) {
        element.style.setProperty(cssPropertyName, widthPx);
      }
    },
    frameMutation,
  );

  function handleMouseUp() {
    requestMutation(() => {
      document.body.classList.remove('cursor-ew-resize');
    });
  }

  function initResize(e: MouseEvent) {
    e.preventDefault();

    requestMutation(() => {
      document.body.classList.add('cursor-ew-resize');
    });

    setInitialMouseX(e.clientX);
    setInitialElementWidth(elementRef()!.offsetWidth);
    markIsActive();
  }

  function resetResize(e: MouseEvent) {
    e.preventDefault();
    setElementStyle(undefined);
    onReset();
  }

  createMeasureEffect(
    depsOf(() => [initialElementWidth(), initialMouseX(), isActive()] as const),
    ([initialElementWidth2, initialMouseX2, isActive2]) => {
      if (!isActive2) return undefined;

      const handleMouseMove = (e: MouseEvent) => {
        const newWidth = Math.ceil(initialElementWidth2 + e.clientX - initialMouseX2);
        setElementStyle(newWidth);
      };

      function stopDrag() {
        cleanup();
        onResize(elementRef()!.offsetWidth);
      }

      function cleanup() {
        handleMouseUp();
        document.removeEventListener('mousemove', handleMouseMove, false);
        document.removeEventListener('mouseup', stopDrag, false);
        document.removeEventListener('blur', stopDrag, false);
        unmarkIsActive();
      }

      document.addEventListener('mousemove', handleMouseMove, false);
      document.addEventListener('mouseup', stopDrag, false);
      document.addEventListener('blur', stopDrag, false);

      return cleanup;
    },
  );

  return { initResize, resetResize, handleMouseUp };
}
