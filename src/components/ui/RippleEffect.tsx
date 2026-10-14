import { createSignal, onMount } from 'frameact';
import { For } from 'frameact/dom';

import { debounce } from '../../util/schedulers';

import './RippleEffect.scss';

interface Ripple {
  x: number;
  y: number;
  size: number;
}

const ANIMATION_DURATION_MS = 700;

const RippleEffect = () => {
  const [ripples, setRipples] = createSignal<Ripple[]>([]);
  let containerRef!: HTMLDivElement;

  const cleanUpDebounced = debounce(
    () => {
      setRipples([]);
    },
    ANIMATION_DURATION_MS,
    false,
  );

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;

    const parent = containerRef?.parentElement;
    if (!parent) return;

    const position = parent.getBoundingClientRect();
    const rippleSize = parent.offsetWidth / 2;

    setRipples((prev) => [
      ...prev,
      {
        x: e.clientX - position.x - rippleSize / 2,
        y: e.clientY - position.y - rippleSize / 2,
        size: rippleSize,
      },
    ]);

    cleanUpDebounced();
  };

  onMount(() => {
    const parent = containerRef?.parentElement;
    if (!parent) return undefined;

    parent.addEventListener('mousedown', handleMouseDown);
    return () => parent.removeEventListener('mousedown', handleMouseDown);
  });

  return (
    <div ref={containerRef} class="ripple-container">
      <For each={ripples()}>
        {({ x, y, size }) => (
          <div class="ripple-wave" style={`left: ${x}px; top: ${y}px; width: ${size}px; height: ${size}px;`} />
        )}
      </For>
    </div>
  );
};

export default RippleEffect;
