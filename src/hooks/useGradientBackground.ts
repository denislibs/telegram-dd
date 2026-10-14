import { createEffect, onMount, requestMutation } from 'frameact';
import { depsOf } from '../util/effectDeps';

import type { GradientRenderer } from '../util/gradientBackground';

import { createGradientRenderer, renderStaticGradient } from '../util/gradientBackground';

// The gradient is smooth, so a small canvas stretched by CSS keeps it cheap
const CANVAS_SIZE = 100;

// TODO(codemod): useGradientBackground: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useGradientBackground(
  colors?: string[],
  shouldSnap?: boolean,
  isStatic?: boolean,
  rotation?: number,
) {
  let canvasRef!: HTMLCanvasElement;
  let rendererRef: GradientRenderer | undefined;

  const colorsKey = colors?.join(',');
  // Read at mutation time so a color change picks up the current mode without re-running the effect
  let shouldSnapRef = shouldSnap;
  shouldSnapRef = shouldSnap;

  createEffect(
    depsOf(() => [colorsKey, isStatic, rotation]),
    () => {
      const canvas = canvasRef;
      if (!canvas || !colors?.length) {
        rendererRef?.destroy();
        rendererRef = undefined;
        return undefined;
      }

      let isCancelled = false;

      // Resizing the canvas is a DOM write, so it must happen in the mutation phase
      requestMutation(() => {
        if (isCancelled) return;

        if (isStatic) {
          // A previous animated renderer must release its context before the canvas switches to 2D
          rendererRef?.destroy();
          rendererRef = undefined;
          renderStaticGradient(canvas, colors, rotation);
          canvas.dataset.ready = 'true';
          return;
        }

        // Keep the renderer alive across color changes so it can morph to the new colors
        if (rendererRef) {
          rendererRef.update(colors, shouldSnapRef, rotation);
          return;
        }

        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
        rendererRef = createGradientRenderer(canvas, colors, rotation);
        if (rendererRef) {
          // Reveal the canvas only once the gradient is drawn, so CSS can fade it in over the base color
          canvas.dataset.ready = 'true';
        } else {
          // WebGL is unavailable or initialization failed after claiming the canvas; the static
          // renderer handles both cases and remains masked by the pattern in masked mode
          renderStaticGradient(canvas, colors, rotation);
          canvas.dataset.ready = 'true';
        }
      });

      return () => {
        isCancelled = true;
      };
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    },
  );

  onMount(() => {
    return () => {
      rendererRef?.destroy();
      rendererRef = undefined;
    };
  });

  // TODO(codemod): "canvasRef" was a ref object passed as a value: pass an accessor (() => canvasRef) or a callback ref
  return canvasRef;
}
