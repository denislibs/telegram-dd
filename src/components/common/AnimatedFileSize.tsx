import { createEffect, createMemo, createSignal, onDestroy } from 'frameact';
import { Show } from 'frameact/dom';

import { depsOf } from '../../util/effectDeps';
import { formatFileSize } from '../../util/textFormat';

import useLang from '../../hooks/useLang';

type OwnProps = {
  className?: string;
  size: number;
  progress?: number;
};

const SKIP_AFTER = 1024 * 1024 * 1024; // 1GB
const MIN_SIZE_INCREASE = 256 * 1024; // 256KB
const UPDATES_PER_SECOND = 10;

const AnimatedFileSize = (props: OwnProps) => {
  const lang = useLang();
  const [currentSize, setCurrentSize] = createSignal<number>(0);
  let timerRef: number | undefined;

  const resetAnimation = () => {
    clearTimeout(timerRef);
    timerRef = undefined;
  };

  const animateSize = () => {
    if (props.progress === undefined) return;

    const currentTarget = props.size * props.progress;
    const diff = currentTarget - currentSize();

    if (diff !== 0) {
      const increase = Math.max(MIN_SIZE_INCREASE, diff / UPDATES_PER_SECOND);
      const newSize = Math.min(currentTarget, currentSize() + increase);
      setCurrentSize(newSize);
    }

    timerRef = window.setTimeout(() => {
      animateSize();
    }, 1000 / UPDATES_PER_SECOND);
  };

  createEffect(
    depsOf(() => [props.progress, props.size] as const),
    ([progress2, size2]) => {
      if (progress2 === undefined) {
        resetAnimation();
        setCurrentSize(0);
        return;
      }

      const currentProgress = size2 * progress2;
      if (currentProgress > SKIP_AFTER || progress2 === 1) {
        resetAnimation();
        setCurrentSize(currentProgress);
        return;
      }

      if (timerRef) return;

      animateSize();
    },
  );

  onDestroy(resetAnimation);

  const currentSizeString = createMemo(() => formatFileSize(lang, currentSize(), 2));
  const totalSizeString = createMemo(() => formatFileSize(lang, props.size));

  return (
    <Show when={!(props.progress === undefined || props.progress === 1)} fallback={totalSizeString()}>
      <span class={props.className} dir={lang.isRtl ? 'rtl' : undefined}>
        {lang(
          'FileTransferProgress',
          {
            currentSize: currentSizeString(),
            totalSize: totalSizeString(),
          },
          { withNodes: true },
        )}
      </span>
    </Show>
  );
};

export default AnimatedFileSize;
