import { createMemo, createSignal } from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions } from '../../global';

import { type ApiMessageEntityFormattedDate, ApiMessageEntityTypes } from '../../api/types';

import { copyTextToClipboard } from '../../util/clipboard';
import {
  formatFormattedDateText,
  getCanonicalFormattedDate,
  getFormattedDateFormatString,
} from '../../util/dates/formattedDate';
import { getServerTime } from '../../util/serverTime';

import useInterval from '../../hooks/schedulers/useInterval';
import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import useLang from '../../hooks/useLang';
import useSchedule from '../../hooks/useSchedule';

import Menu from '../ui/Menu';
import MenuItem from '../ui/MenuItem';

type OwnProps = {
  children?: JSX.Element;
  entity: ApiMessageEntityFormattedDate;
  asPreview?: boolean;
  chatId?: string;
  messageId?: number;
};

const FormattedDate = (props: OwnProps) => {
  const { showNotification, openForwardMenu, forwardToSavedMessages } = getActions();
  const [cacheBreaker, setCacheBreaker] = createSignal(0);

  let ref!: HTMLAnchorElement;
  let menuRef!: HTMLDivElement;

  const lang = useLang();

  const [requestCalendar, calendar] = useSchedule(undefined, undefined, () => Math.max(props.entity.date, getServerTime()));

  useInterval(
    () => setCacheBreaker((prev) => prev + 1),
    () => props.entity.relative && getUpdateInterval(Math.abs(props.entity.date - getServerTime())),
  );

  const canSetReminder = createMemo(() => Boolean(props.chatId && props.messageId));

  const memoResult = createMemo(() => {
    void cacheBreaker();

    const { type, offset, length, date, ...formatOptions } = props.entity;
    const canonical = getCanonicalFormattedDate(lang, date);
    const formatted = formatFormattedDateText(lang, date, formatOptions);

    return { formattedDate: formatted, canonicalDate: canonical };
  });
  const formattedDate = () => memoResult().formattedDate;
  const canonicalDate = () => memoResult().canonicalDate;

  const contextMenuHandlersResult = createMemo(() => useContextMenuHandlers(() => ref, () => props.asPreview));
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;
  const contextMenuAnchor = () => contextMenuHandlersResult().contextMenuAnchor;
  const handleContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;

  const getTriggerElement = () => ref;
  const getRootElement = () => document.body;
  const getMenuElement = () => menuRef;
  const getLayout = () => ({ withPortal: true });

  const handleCopy = () => {
    copyTextToClipboard(canonicalDate());
    showNotification({ message: lang('DateCopiedToast') });
  };

  const handleSetReminder = () => {
    if (!props.chatId || !props.messageId) return;
    requestCalendar((scheduledAt) => {
      openForwardMenu({ fromChatId: props.chatId, messageIds: [props.messageId] });
      forwardToSavedMessages({ scheduledAt });
      showNotification({
        message: {
          key: 'ReminderSetToast',
          options: {
            withNodes: true,
            withMarkdown: true,
          },
        },
      });
    });
  };

  return (
    <Show when={!props.asPreview} fallback={formattedDate() ?? props.children}>
    <a
      ref={ref}
      onClick={handleContextMenu()}
      onContextMenu={handleContextMenu()}
      class="text-entity-link"
      dir="auto"
      data-entity-type={ApiMessageEntityTypes.FormattedDate}
      data-unix={props.entity.date}
      data-format={getFormattedDateFormatString(props.entity)}
      title={canonicalDate()}
    >
      {formattedDate() ?? props.children}
      <Menu
        ref={menuRef}
        isOpen={isContextMenuOpen()}
        anchor={contextMenuAnchor()}
        getTriggerElement={getTriggerElement}
        getRootElement={getRootElement}
        getMenuElement={getMenuElement}
        getLayout={getLayout}
        onClose={handleContextMenuClose()}
        onCloseAnimationEnd={handleContextMenuHide()}
        withPortal
        autoClose
      >
        <MenuItem icon="copy" onClick={handleCopy}>
          {lang('MenuCopyDate')}
        </MenuItem>
        {canSetReminder() && (
          <MenuItem icon="unmute" onClick={handleSetReminder}>
            {lang('SetReminder')}
          </MenuItem>
        )}
      </Menu>
      {calendar}
    </a>
    </Show>
  );
};

export default FormattedDate;

function getUpdateInterval(diffInSeconds: number) {
  if (diffInSeconds < 60) {
    return 1000;
  }

  if (diffInSeconds < 60 * 60) {
    return 60000;
  }

  if (diffInSeconds < 60 * 60 * 24) {
    return 3600000;
  }

  return undefined;
}
