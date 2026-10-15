import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions } from '../../../../global';

import type { ApiReaction, ApiSavedReactionTag } from '../../../../api/types';

import buildClassName from '../../../../util/buildClassName';
import { REM } from '../../../common/helpers/mediaDimensions';

import useContextMenuHandlers from '../../../../hooks/useContextMenuHandlers';
import useFlag from '../../../../hooks/useFlag';
import useOldLang from '../../../../hooks/useOldLang';

import ReactionAnimatedEmoji from '../../../common/reactions/ReactionAnimatedEmoji';
import PromptDialog from '../../../modals/prompt/PromptDialog';
import Button from '../../../ui/Button';
import Menu from '../../../ui/Menu';
import MenuItem from '../../../ui/MenuItem';

import styles from './ReactionButton.module.scss';

const REACTION_SIZE = 1.25 * REM;
const TITLE_MAX_LENGTH = 15;
const LOOP_LIMIT = 1;

type OwnProps = {
  reaction: ApiReaction;
  tag?: ApiSavedReactionTag;
  containerId: string;
  isChosen?: boolean;
  isOwnMessage?: boolean;
  withCount?: boolean;
  className?: string;
  chosenClassName?: string;
  isDisabled?: boolean;
  withContextMenu?: boolean;
  observeIntersection?: ObserveFn;
  onClick?: (reaction: ApiReaction) => void;
  onRemove?: (reaction: ApiReaction) => void;
};

const SavedTagButton = (props: OwnProps) => {
  const { editSavedReactionTag } = getActions();
  let ref!: HTMLButtonElement;
  let menuRef!: HTMLDivElement;

  const lang = useOldLang();
  const [isRenamePromptOpen, openRenamePrompt, closeRenamePrompt] = useFlag();

  const source = createMemo(() => props.tag || {});
  const title = () => source().title;
  const count = () => source().count;
  const hasText = createMemo(() => Boolean(title() || (props.withCount && count())));

  const handleClick = () => {
    props.onClick?.(props.reaction);
  };

  const handleRemoveClick = () => {
    props.onRemove?.(props.reaction);
  };

  const handleRenameTag = (newTitle: string) => {
    editSavedReactionTag({
      reaction: props.reaction,
      title: newTitle,
    });
    closeRenamePrompt();
  };

  const contextMenuHandlersResult = createMemo(() => useContextMenuHandlers(() => ref, () => !props.withContextMenu, undefined, undefined, undefined, true));
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;
  const contextMenuAnchor = () => contextMenuHandlersResult().contextMenuAnchor;
  const handleBeforeContextMenu = () => contextMenuHandlersResult().handleBeforeContextMenu;
  const handleContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;

  const getTriggerElement = () => ref;
  const getRootElement = () => document.body;
  const getMenuElement = () => menuRef;
  const getLayout = () => ({ withPortal: true, shouldAvoidNegativePosition: true });

  return (
    <Show when={!(props.withCount && count() === 0)}>
    <Button
      className={buildClassName(
        styles.root,
        styles.tag,
        props.isOwnMessage && styles.own,
        props.isChosen && styles.chosen,
        props.isChosen && props.chosenClassName,
        props.isDisabled && styles.disabled,
        props.className,
      )}
      size="tiny"
      onClick={handleClick}
      onMouseDown={handleBeforeContextMenu()}
      onContextMenu={handleContextMenu()}
      ref={ref}
    >
      <ReactionAnimatedEmoji
        className={styles.animatedEmoji}
        containerId={props.containerId}
        reaction={props.reaction}
        loopLimit={LOOP_LIMIT}
        size={REACTION_SIZE}
        observeIntersection={props.observeIntersection}
      />
      {hasText() && (
        <span class={styles.tagText}>
          {title() && <span>{title()}</span>}
          {props.withCount && <span>{count()}</span>}
        </span>
      )}
      <svg class={styles.tail} width="15" height="30" viewBox="0 0 15 30">
        <path
          class={styles.tailFill}
          d="m 0,30 c 3.1855,0 6.1803,-1.5176 8.0641,-4.0864 l 5.835,-7.9568 c 1.2906,-1.7599 1.2906,-4.1537 0,-5.9136 L 8.0641,4.08636 C 6.1803,1.51761 3.1855,0 0,0"
        />
      </svg>
      {props.withContextMenu && (
        <PromptDialog
          isOpen={isRenamePromptOpen()}
          maxLength={TITLE_MAX_LENGTH}
          title={lang(props.tag?.title ? 'SavedTagRenameTag' : 'SavedTagLabelTag')}
          subtitle={lang('SavedTagLabelTagText')}
          placeholder={lang('SavedTagLabelPlaceholder')}
          initialValue={props.tag?.title}
          onClose={closeRenamePrompt}
          onSubmit={handleRenameTag}
        />
      )}
      {props.withContextMenu && contextMenuAnchor() && (
        <Menu
          ref={menuRef}
          isOpen={isContextMenuOpen()}
          anchor={contextMenuAnchor()}
          getTriggerElement={getTriggerElement}
          getRootElement={getRootElement}
          getMenuElement={getMenuElement}
          getLayout={getLayout}
          autoClose
          withPortal
          onClose={handleContextMenuClose()}
          onCloseAnimationEnd={handleContextMenuHide()}
        >
          <MenuItem icon="tag-filter" onClick={handleClick}>
            {lang('SavedTagFilterByTag')}
          </MenuItem>
          <MenuItem icon="tag-name" onClick={openRenamePrompt}>
            {lang(props.tag?.title ? 'SavedTagRenameTag' : 'SavedTagLabelTag')}
          </MenuItem>
          <MenuItem icon="tag-crossed" destructive onClick={handleRemoveClick}>
            {lang('SavedTagRemoveTag')}
          </MenuItem>
        </Menu>
      )}
    </Button>
    </Show>
  );
};

export default SavedTagButton;
