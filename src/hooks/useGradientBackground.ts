import { createEffect, createSignal, onMount, requestMutation } from 'frameact';

import type { GradientRenderer } from '../util/gradientBackground';

import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';
import { createGradientRenderer, renderStaticGradient } from '../util/gradientBackground';

// The gradient is smooth, so a small canvas stretched by CSS keeps it cheap
const CANVAS_SIZE = 100;

// Deviation: the params are accessors; the hook returns a callback ref for the `<canvas>` (frameact assigns refs at
// element creation, so the element is a signal the effect depends on: a remounted canvas re-runs it).
export default function useGradientBackground(
  colors?: MaybeAccessor<string[] | undefined>,
  shouldSnap?: MaybeAccessor<boolean | undefined>,
  isStatic?: MaybeAccessor<boolean | undefined>,
  rotation?: MaybeAccessor<number | undefined>,
) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>(undefined);
  let rendererRef: GradientRenderer | undefined;

  createEffect(
    depsOf(() => [read(colors)?.join(','), read(isStatic), read(rotation), canvas()] as const),
    ([, isStatic2, rotation2, canvas2]) => {
      const colors2 = read(colors);
      if (!canvas2 || !colors2?.length) {
        rendererRef?.destroy();
        rendererRef = undefined;
        return undefined;
      }

      let isCancelled = false;

      // Resizing the canvas is a DOM write, so it must happen in the mutation phase
      requestMutation(() => {
        if (isCancelled) return;

        if (isStatic2) {
          // A previous animated renderer must release its context before the canvas switches to 2D
          rendererRef?.destroy();
          rendererRef = undefined;
          renderStaticGradient(canvas2, colors2, rotation2);
          canvas2.dataset.ready = 'true';
          return;
        }

        // Keep the renderer alive across color changes so it can morph to the new colors
        if (rendererRef) {
          // Read at mutation time so a color change picks up the current mode without re-running the effect
          rendererRef.update(colors2, read(shouldSnap), rotation2);
          return;
        }

        canvas2.width = CANVAS_SIZE;
        canvas2.height = CANVAS_SIZE;
        rendererRef = createGradientRenderer(canvas2, colors2, rotation2);
        if (rendererRef) {
          // Reveal the canvas only once the gradient is drawn, so CSS can fade it in over the base color
          canvas2.dataset.ready = 'true';
        } else {
          // WebGL is unavailable or initialization failed after claiming the canvas; the static
          // renderer handles both cases and remains masked by the pattern in masked mode
          renderStaticGradient(canvas2, colors2, rotation2);
          canvas2.dataset.ready = 'true';
        }
      });

      return () => {
        isCancelled = true;
      };
    },
  );

  onMount(() => {
    return () => {
      rendererRef?.destroy();
      rendererRef = undefined;
    };
  });

  return (el: HTMLCanvasElement) => setCanvas(el);
}
