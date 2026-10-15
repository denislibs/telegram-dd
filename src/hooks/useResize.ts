import { createMeasureEffect, createMutationEffect, createSignal, requestMutation } from 'frameact';
import { depsOf } from '../util/effectDeps';

import useFlag from './useFlag';
import useLastCallback from './useLastCallback';

// TODO(codemod): useResize: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useResize(
  elementRef: (el: HTMLElement) => void,
  onResize: (width: number) => void,
  onReset: NoneToVoidFunction,
  initialWidth?: number,
  cssPropertyName?: string,
) {
  const [isActive, markIsActive, unmarkIsActive] = useFlag();
  const [initialMouseX, setInitialMouseX] = createSignal<number>(0);
  const [initialElementWidth, setInitialElementWidth] = createSignal<number>(0);

  const setElementStyle = (width?: number) => {
    requestMutation(() => {
      if (!elementRef.current) {
        return;
      }

      const widthPx = width ? `${width}px` : '';
      elementRef.current.style.width = widthPx;
      if (cssPropertyName) {
        elementRef.current.style.setProperty(cssPropertyName, widthPx);
      }
    });
  };

  // Apply directly instead of via `requestMutation` to avoid a one-frame delay
  // (layout effects already run in the mutation phase)
  createMutationEffect(depsOf(() => [cssPropertyName, elementRef, initialWidth]), () => {
    if (!elementRef.current || !initialWidth) {
      return;
    }

    const widthPx = `${initialWidth}px`;
    elementRef.current.style.width = widthPx;
    if (cssPropertyName) {
      elementRef.current.style.setProperty(cssPropertyName, widthPx);
    }
  });

  function handleMouseUp() {
    requestMutation(() => {
      document.body.classList.remove('cursor-ew-resize');
    });
  }

  function initResize(e: React.MouseEvent<HTMLElement, MouseEvent>) {
    e.preventDefault();

    requestMutation(() => {
      document.body.classList.add('cursor-ew-resize');
    });

    setInitialMouseX(e.clientX);
    setInitialElementWidth(elementRef.current!.offsetWidth);
    markIsActive();
  }

  function resetResize(e: React.MouseEvent<HTMLElement, MouseEvent>) {
    e.preventDefault();
    setElementStyle(undefined);
    onReset();
  }

  createMeasureEffect(depsOf(() => [initialElementWidth(), initialMouseX(), elementRef, onResize, isActive(), unmarkIsActive, setElementStyle] as const), ([initialElementWidth2, initialMouseX2, , , isActive2]) => {
    if (!isActive2) return undefined;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.ceil(initialElementWidth2 + e.clientX - initialMouseX2);
      setElementStyle(newWidth);
    };

    function stopDrag() {
      cleanup();
      onResize(elementRef.current!.offsetWidth);
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
  });

  return { initResize, resetResize, handleMouseUp };
}
