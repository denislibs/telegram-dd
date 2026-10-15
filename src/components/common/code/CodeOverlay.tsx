import { createMeasureEffect, createSignal } from 'frameact';
import { getActions } from '../../../global';

import buildClassName from '../../../util/buildClassName';
import { copyTextToClipboard } from '../../../util/clipboard';
import { depsOf } from '../../../util/effectDeps';
import { areLinesWrapping } from '../helpers/renderText';

import useOldLang from '../../../hooks/useOldLang';
import useWindowSize from '../../../hooks/window/useWindowSize';

import Icon from '../icons/Icon';

import styles from './CodeOverlay.module.scss';

export type OwnProps = {
  className?: string;
  text: string;
  noCopy?: boolean;
  onWordWrapToggle?: (wrap: boolean) => void;
};

const CodeOverlay = (props: OwnProps) => {
  const { showNotification } = getActions();
  let ref!: HTMLDivElement;
  const windowSize = useWindowSize();
  const lang = useOldLang();
  const [isWordWrap, setIsWordWrap] = createSignal(true);
  const [withWordWrapButton, setWithWordWrapButton] = createSignal(false);

  const checkWordWrap = () => {
    const isWrap = areLinesWrapping(props.text, ref.parentElement!);
    setWithWordWrapButton(isWrap);
  };

  // `areLinesWrapping` reads the layout: a measure effect (tt's `useEffect` of the measure phase)
  createMeasureEffect(
    depsOf(() => [isWordWrap(), props.text, windowSize()] as const),
    ([isWordWrap2]) => {
      if (isWordWrap2) {
        checkWordWrap();
      }
    },
  );

  const handleCopy = () => {
    copyTextToClipboard(props.text);
    showNotification({
      message: lang('TextCopied'),
    });
  };

  const handleWordWrapClick = () => {
    // Read before the write: a signal write is visible at once
    const wrap = !isWordWrap();
    setIsWordWrap(wrap);
    props.onWordWrapToggle?.(wrap);
  };

  return (
    <div class={buildClassName(styles.overlay, props.className)} ref={ref}>
      <div class={buildClassName(styles.content, !withWordWrapButton() && props.noCopy && styles.hidden)}>
        {withWordWrapButton() && (
          <div
            class={buildClassName(styles.wrap, isWordWrap() && styles.wrapOn)}
            onClick={handleWordWrapClick}
            title="Word Wrap"
          >
            <Icon name="word-wrap" />
          </div>
        )}
        {!props.noCopy && (
          <div class={styles.copy} onClick={handleCopy} title={lang('Copy')}>
            <Icon name="copy" />
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeOverlay;
