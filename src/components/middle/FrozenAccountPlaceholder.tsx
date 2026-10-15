import { getActions } from '../../global';

import useLang from '../../hooks/useLang';

import styles from './FrozenAccountPlaceholder.module.scss';

function FrozenAccountPlaceholder() {
  const lang = useLang();

  const { openFrozenAccountModal } = getActions();

  const handleClick = () => {
    openFrozenAccountModal();
  };

  return (
    <div class={styles.root} onClick={handleClick}>
      <div class={styles.title}>{lang('ComposerTitleFrozenAccount')}</div>
      <div class={styles.subtitle}>{lang('ComposerSubtitleFrozenAccount')}</div>
    </div>
  );
}

export default FrozenAccountPlaceholder;
