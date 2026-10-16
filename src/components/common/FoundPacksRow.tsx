import { createSignal, onMount } from 'frameact';

import buildClassName from '../../util/buildClassName';

import useHorizontalScroll from '../../hooks/useHorizontalScroll';

import pickerStyles from '../middle/composer/StickerPicker.module.scss';

type OwnProps = {
  children: React.ReactNode;
};

function FoundPacksRow(props: OwnProps) {
  let rootRef!: HTMLDivElement;
  // Deviation: `useHorizontalScroll` reads its ref in the first compute, before the element exists, so the element is
  // handed over as a signal once it is attached (a write from the ref callback would dirty the hook's measure effect
  // from the mutate phase).
  const [ref, setRef] = createSignal<HTMLDivElement | undefined>(undefined);
  onMount(() => {
    setRef(rootRef);
  });

  useHorizontalScroll(ref, undefined, true);

  return (
    <div ref={rootRef} class={buildClassName(pickerStyles.foundPacks, 'no-scrollbar')}>
      {props.children}
    </div>
  );
}

export default FoundPacksRow;
