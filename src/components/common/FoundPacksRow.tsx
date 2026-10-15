import buildClassName from '../../util/buildClassName';

import useHorizontalScroll from '../../hooks/useHorizontalScroll';

import pickerStyles from '../middle/composer/StickerPicker.module.scss';

type OwnProps = {
  children: React.ReactNode;
};

function FoundPacksRow(props: OwnProps) {
  let ref!: HTMLDivElement;

  useHorizontalScroll(() => ref, undefined, true);

  return (
    <div ref={ref} class={buildClassName(pickerStyles.foundPacks, 'no-scrollbar')}>
      {props.children}
    </div>
  );
}

export default FoundPacksRow;
