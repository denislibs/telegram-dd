import { createMemo } from 'frameact';

import type { ApiDocument } from '../../../api/types';
import type { ThemeKey } from '../../../types';
import { ApiMediaFormat } from '../../../api/types';

import { getDocumentMediaHash } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';

import useAppLayout from '../../../hooks/useAppLayout';
import useMedia from '../../../hooks/useMedia';

import styles from './AttachBotIcon.module.scss';

type OwnProps = {
  icon: ApiDocument;
  theme: ThemeKey;
};

const ADDITIONAL_STROKE_WIDTH = '0.5px';
// The icon is an `<img>` fed a data URI, so it cannot inherit `currentColor` from the menu item.
// These mirror `--color-text` per theme and have to be updated alongside it
const DARK_THEME_COLOR = 'rgb(255, 255, 255)';
const LIGHT_THEME_COLOR = 'rgb(0, 0, 0)';
const COLOR_REPLACE_PATTERN = /#fff/gi;

const AttachBotIcon = (props: OwnProps) => {
  const { isTouchScreen } = useAppLayout();
  const mediaData = useMedia(() => getDocumentMediaHash(props.icon, 'full'), false, ApiMediaFormat.Text);

  const iconSvg = createMemo(() => {
    if (!mediaData) return '';
    const color = props.theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;

    const mediaDataWithReplacedColors = mediaData.replace(COLOR_REPLACE_PATTERN, color);
    const doc = new DOMParser().parseFromString(mediaDataWithReplacedColors, 'image/svg+xml');
    doc.querySelectorAll('path').forEach((path) => {
      path.style.stroke = color;
      path.style.strokeWidth = ADDITIONAL_STROKE_WIDTH;
    });

    return `data:image/svg+xml;utf8,${doc.documentElement.outerHTML}`;
  });

  return (
    <i class={buildClassName(styles.root, 'icon', !isTouchScreen && styles.compact)}>
      <img
        src={iconSvg()}
        alt=""
        class={buildClassName(styles.image, !isTouchScreen && styles.compact)}
        draggable={false}
      />
    </i>
  );
};

export default AttachBotIcon;
