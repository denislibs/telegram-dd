import type { JSX } from 'frameact/jsx-runtime';

import type { IAlbumLayoutItem } from './helpers/calculateAlbumLayout';

import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import { AlbumRectPart } from './helpers/calculateAlbumLayout';

import styles from './AlbumItem.module.scss';

type OwnProps = {
  item: IAlbumLayoutItem;
  children: JSX.Element;
  className?: string;
};

const AlbumItem = (props: OwnProps) => {
  return (
    <div
      class={buildClassName(
        styles.root,
        !(props.item.sides & AlbumRectPart.Left) && styles.withLeftGap,
        !(props.item.sides & AlbumRectPart.Top) && styles.withTopGap,
        !(props.item.sides & AlbumRectPart.Right) && styles.withRightGap,
        !(props.item.sides & AlbumRectPart.Bottom) && styles.withBottomGap,
        props.className,
      )}
      style={buildStyle(
        `left: ${props.item.rect.x * 100}%`,
        `top: ${props.item.rect.y * 100}%`,
        `width: ${props.item.rect.width * 100}%`,
        `height: ${props.item.rect.height * 100}%`,
      )}
    >
      {props.children}
    </div>
  );
};

export default AlbumItem;
