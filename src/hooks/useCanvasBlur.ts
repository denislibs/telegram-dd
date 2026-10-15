import { createEffect, createSignal, requestMeasure, requestMutation } from 'frameact';

import fastBlur from '../lib/fastBlur';
import { type MaybeAccessor, read } from '../util/accessors';
import { IS_CANVAS_FILTER_SUPPORTED } from '../util/browser/windowEnvironment';
import { depsOf } from '../util/effectDeps';

const RADIUS = 2;
const ITERATIONS = 2;

// Deviation: the parameters are `MaybeAccessor`s and the hook returns a callback ref for the canvas (tt returned a ref
// object): the element is kept in a signal, so a canvas that is created later than the hook (a conditional element)
// is blurred as soon as it exists. A new element also resets the "started" flag (it has no pixels yet).
export default function useCanvasBlur(
  dataUri?: MaybeAccessor<string | undefined>,
  isDisabled: MaybeAccessor<boolean> = false,
  withRaf?: MaybeAccessor<boolean | undefined>,
  radius: MaybeAccessor<number> = RADIUS,
  preferredWidth?: MaybeAccessor<number | undefined>,
  preferredHeight?: MaybeAccessor<number | undefined>,
) {
  const [canvasEl, setCanvasEl] = createSignal<HTMLCanvasElement | undefined>(undefined);
  let isStarted = false;

  // tt: `useSyncEffect`; the reset must run before the blur effect below, which is created after it.
  createEffect(
    depsOf(() => [read(dataUri), read(isDisabled), canvasEl()] as const),
    ([, isDisabled2]) => {
      if (!isDisabled2) {
        isStarted = false;
      }
    },
  );

  createEffect(
    depsOf(
      () =>
        [
          canvasEl(),
          read(dataUri),
          read(isDisabled),
          read(preferredHeight),
          read(preferredWidth),
          read(radius),
          read(withRaf),
        ] as const,
    ),
    ([canvas, dataUri2, isDisabled2, preferredHeight2, preferredWidth2, radius2, withRaf2]) => {
      if (!dataUri2 || !canvas || isDisabled2 || isStarted) {
        return;
      }

      isStarted = true;

      const img = new Image();

      const processBlur = () => {
        const width = preferredWidth2 || img.width;
        const height = preferredHeight2 || img.height;
        const ctx = canvas.getContext('2d', { alpha: false })!;

        requestMutation(() => {
          canvas.width = width;
          canvas.height = height;

          if (IS_CANVAS_FILTER_SUPPORTED) {
            ctx.filter = `blur(${radius2}px)`;
          }

          ctx.drawImage(img, -radius2 * 2, -radius2 * 2, width + radius2 * 4, height + radius2 * 4);

          if (!IS_CANVAS_FILTER_SUPPORTED) {
            fastBlur(ctx, 0, 0, width, height, radius2, ITERATIONS);
          }
        });
      };

      img.onload = () => {
        if (withRaf2) {
          requestMeasure(processBlur);
        } else {
          processBlur();
        }
      };

      img.src = dataUri2;
    },
  );

  return (el: HTMLCanvasElement) => {
    setCanvasEl(el);
  };
}
