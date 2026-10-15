import type { IconName } from '../../types/icons';

import buildClassName from '../../util/buildClassName';
import { formatIntegerCompact } from '../../util/textFormat';

import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';

import Button from '../ui/Button';
import Menu from '../ui/Menu';
import MenuItem from '../ui/MenuItem';

import styles from './ScrollDownButton.module.scss';

type OwnProps = {
  icon: IconName;
  ariaLabelLang: string;
  unreadCount?: number;
  onClick: VoidFunction;
  onReadAll?: VoidFunction;
  className?: string;
};

const ScrollDownButton = (props: OwnProps) => {
  const oldLang = useOldLang();
  const lang = useLang();

  let ref!: HTMLDivElement;
  const { isContextMenuOpen, handleContextMenu, handleContextMenuClose, handleContextMenuHide } =
    useContextMenuHandlers(
      () => ref,
      () => !props.onReadAll,
    );

  return (
    <div class={buildClassName(styles.root, props.className)} ref={ref}>
      <Button
        color="secondary"
        round
        className={styles.button}
        onClick={props.onClick}
        onContextMenu={handleContextMenu}
        ariaLabel={oldLang(props.ariaLabelLang)}
        iconName={props.icon}
        iconClassName={styles.icon}
      />
      {Boolean(props.unreadCount) && (
        <div class={styles.unreadCount}>{formatIntegerCompact(lang, props.unreadCount)}</div>
      )}
      {props.onReadAll && (
        <Menu
          isOpen={isContextMenuOpen()}
          onClose={handleContextMenuClose}
          onCloseAnimationEnd={handleContextMenuHide}
          autoClose
          positionX="right"
          positionY="bottom"
        >
          <MenuItem icon="readchats" onClick={props.onReadAll}>
            {oldLang('MarkAllAsRead')}
          </MenuItem>
        </Menu>
      )}
    </div>
  );
};

export default ScrollDownButton;
