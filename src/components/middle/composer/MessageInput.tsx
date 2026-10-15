import { findChildren } from '@tiptap/core';
import {
  createEffect,
  createMeasureEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  onMount,
  requestForcedReflow,
  requestMeasure,
  requestMutation,
} from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions, withGlobal } from '../../../global';

import type { ApiFormattedText, ApiInputDraftReplyInfo, ApiInputRichMessage } from '../../../api/types';
import type { GlobalState, SharedSettings } from '../../../global/types';
import type { MessageListType, ThreadId } from '../../../types';
import type { RichEditorDateClickTarget } from '../../../util/tiptap/extensions/date';
import type { RichEditorTooltipsConfig } from '../../common/tooltips/types';
import type { RichEditor, RichEditorMediaEditHandler, RichEditorMediaFilesHandler } from './richEditorTypes';

import { DEBUG, EDITABLE_INPUT_ID, EDITABLE_INPUT_MODAL_ID } from '../../../config';
import { getRichMessageUsage } from '../../../global/helpers/richMessage';
import { selectIsInSelectMode } from '../../../global/selectors';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import { selectDraft } from '../../../global/selectors/threads';
import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import { IS_ANDROID, IS_IOS, IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import captureKeyboardListeners, { hasActiveHandler } from '../../../util/captureKeyboardListeners';
import { getIsDirectTextInputDisabled } from '../../../util/directInputManager';
import { depsOf } from '../../../util/effectDeps';
import focusEditableElement from '../../../util/focusEditableElement';
import { CODE_HIGHLIGHTING_CHANGED_META, subscribeToCodeLanguageLoad } from '../../../util/highlightCode';
import { debounce, fastRaf, throttleWith } from '../../../util/schedulers';
import { getUtf8Length } from '../../../util/textFormat';
import tiptapStyles from '../../../util/tiptap/styling.module.scss';
import renderText from '../../common/helpers/renderText';
import {
  getRichInputAsFormatted,
  hasUnsupportedRichBlocks,
  removeUnsupportedRichBlocks,
} from '../../ui/textInput/richText';
import { RICH_INPUT_MODE_CHANGED_META } from './helpers/richEditorMode';

import useAppLayout from '../../../hooks/useAppLayout';
import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useOldLang from '../../../hooks/useOldLang';
import useScrollableHint from '../../../hooks/useScrollableHint';

import AnimatedCounter from '../../common/AnimatedCounter';
import CalendarModal from '../../common/CalendarModal.async';
import Icon from '../../common/icons/Icon';
import { refreshRichEditorTooltips } from '../../common/tooltips/extensions/RichEditorTooltips';
import Button from '../../ui/Button';
import FormattedDateModal from './FormattedDateModal';
import RichEditorToolbar from './RichEditorToolbar';

const CONTEXT_MENU_CLOSE_DELAY_MS = 100;
const TRANSITION_DURATION_FACTOR = 50;
const COLLAPSED_RICH_PREVIEW_LINE_COUNT = 3;

const SCROLLER_CLASS = 'input-scroller';
const CONTENT_EDITABLE_SELECTOR = 'div[contenteditable]';

export type OwnProps = {
  ref?: (el: HTMLDivElement) => void;
  id: string;
  chatId: string;
  threadId: ThreadId;
  richEditor: RichEditor;
  tooltips?: RichEditorTooltipsConfig;
  isAttachmentModalInput?: boolean;
  isStoryInput?: boolean;
  editableInputId?: string;
  isActive: boolean;
  placeholder: JSX.Element | string;
  forcedPlaceholder?: string;
  noFocusInterception?: boolean;
  canAutoFocus: boolean;
  shouldSuppressFocus?: boolean;
  canSendPlainText?: boolean;
  isRichInputExpanded?: boolean;
  isNeedPremium?: boolean;
  isRichOnlyContent?: boolean;
  messageListType?: MessageListType;
  maxLength?: number;
  onRichInputCollapse?: NoneToVoidFunction;
  onRichInputExpand?: NoneToVoidFunction;
  onOpenAiEditor?: NoneToVoidFunction;
  onSuppressedFocus?: () => void;
  onMediaEdit?: RichEditorMediaEditHandler;
  onMediaFiles?: RichEditorMediaFilesHandler;
  onSend: () => void;
  // Deviation: a native event (the JSX event types of frameact), nothing in the client passes it.
  onScroll?: (event: Event) => void;
  onFocus?: NoneToVoidFunction;
  onBlur?: NoneToVoidFunction;
};

type StateProps = {
  replyInfo?: ApiInputDraftReplyInfo;
  isSelectModeActive?: boolean;
  messageSendKeyCombo?: SharedSettings['messageSendKeyCombo'];
};

const MAX_ATTACHMENT_MODAL_INPUT_HEIGHT = 160;
const MAX_MESSAGE_INPUT_HEIGHT = 160;
const MAX_STORY_MODAL_INPUT_HEIGHT = 128;
const TAB_INDEX_PRIORITY_TIMEOUT = 2000;
const MAX_REMAINING_LENGTH_TO_SHOW = 100;
const IGNORE_KEYS = [
  'Esc',
  'Escape',
  'Enter',
  'PageUp',
  'PageDown',
  'Meta',
  'Alt',
  'Ctrl',
  'ArrowDown',
  'ArrowUp',
  'Control',
  'Shift',
];

const MessageInput = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { editLastMessage, replyToNextMessage, showAllowedMessageTypesNotification, openPremiumModal } = getActions();

  // The editable element is rendered empty (ProseMirror owns its children and, once the editor is registered, its
  // attributes): see `syncEditorElementAttributes`. It is never re-created.
  let inputRef: HTMLDivElement | undefined;

  let cloneRef: HTMLDivElement | undefined;
  let scrollerCloneRef: HTMLDivElement | undefined;
  let sharedCanvasRef: HTMLCanvasElement | undefined;
  let sharedCanvasHqRef: HTMLCanvasElement | undefined;
  let scrollerRef: HTMLDivElement | undefined;
  let updateRafRef: number | undefined;

  const oldLang = useOldLang();
  const lang = useLang();
  let isContextMenuOpenRef = false;
  let isTextFormatterDisabledRef = IS_ANDROID;
  const [dateEditTarget, setDateEditTarget] = createSignal<RichEditorDateClickTarget | undefined>(undefined);
  const [isDateEditorOpen, openDateEditor, closeDateEditor] = useFlag();
  const { isMobile } = useAppLayout();
  const isMobileDevice = () => isMobile() && (IS_IOS || IS_ANDROID);
  const richValue = createMemo(() => props.richEditor.value);
  const isRichEditorReady = createMemo(() => props.richEditor.isReady);
  // Deviation: `isEmpty()` reads the editor state and tracks nothing; tt re-ran it on every render, here the value signal
  // (set by every editor update) is the dependency.
  const isInputEmpty = createMemo(() => {
    const value = richValue();
    return isRichEditorReady() ? props.richEditor.isEmpty() : !value.blocks.length;
  });

  // Effects that need the element run after the component is mounted (the element exists once the JSX is created, after
  // the effects of the body were created; a mutation effect applies synchronously at creation).
  const [isMounted, setIsMounted] = createSignal(false);
  onMount(() => {
    setIsMounted(true);
  });

  const maxInputHeight = createMemo(() =>
    props.isAttachmentModalInput
      ? MAX_ATTACHMENT_MODAL_INPUT_HEIGHT
      : props.isStoryInput
        ? MAX_STORY_MODAL_INPUT_HEIGHT
        : MAX_MESSAGE_INPUT_HEIGHT,
  );
  const isTouched = createMemo(() => Boolean(props.isActive && !isInputEmpty()));

  const className = createMemo(() =>
    buildClassName(
      'form-control allow-selection',
      isTouched() && 'touched',
      props.shouldSuppressFocus && 'focus-disabled',
      !props.isRichInputExpanded && tiptapStyles.regularInput,
    ),
  );
  const inputScrollerContentClass = createMemo(() =>
    buildClassName('input-scroller-content', props.isNeedPremium && 'is-need-premium'),
  );
  const placeholderAriaLabel = createMemo(() =>
    typeof props.placeholder === 'string' ? props.placeholder : undefined,
  );
  const canRenderRichEditor = createMemo(() => Boolean(props.isAttachmentModalInput || props.canSendPlainText));
  const isMainInput = createMemo(() => !props.isAttachmentModalInput && !props.isStoryInput);
  const hasUnsupportedRichContent = createMemo(
    () => canRenderRichEditor() && Boolean(richValue() && hasUnsupportedRichBlocks(richValue())),
  );
  const isCollapsedRichOnlyPreview = createMemo(() =>
    Boolean(isMainInput() && !props.isRichInputExpanded && props.isRichOnlyContent && !hasUnsupportedRichContent()),
  );
  const isRichEditorEditable = createMemo(() => isRichEditorReady() && !isCollapsedRichOnlyPreview());
  useScrollableHint(() => scrollerRef, { isDisabled: () => !props.isRichInputExpanded });
  const isMainInputLocked = createMemo(() => !props.isAttachmentModalInput && !props.canSendPlainText);
  const editor = createMemo(() => props.richEditor.editor);
  const getTooltipContext = () => ({
    ...(props.tooltips?.getContext() || { chatId: props.chatId }),
    isRichInputExpanded: props.isRichInputExpanded,
    isFormatterDisabled: isTextFormatterDisabledRef,
    isFormatterContextMenuOpen: isContextMenuOpenRef,
  });
  const getIsRootFormatterEnabled = () =>
    Boolean(props.tooltips?.formatter?.isEnabled() && isRichEditorEditable() && !isCollapsedRichOnlyPreview());
  const rootTooltips = createMemo(() =>
    props.tooltips
      ? {
          ...props.tooltips,
          formatter: props.tooltips.formatter
            ? {
                ...props.tooltips.formatter,
                isEnabled: getIsRootFormatterEnabled,
              }
            : undefined,
          getContext: getTooltipContext,
        }
      : undefined,
  );
  const remainingLength = createMemo(() => {
    if (props.maxLength === undefined || !richValue()) {
      return undefined;
    }

    return props.maxLength - getRichInputLength(richValue());
  });
  const canShowLengthIndicator = createMemo(() => {
    const remainingLength2 = remainingLength();
    return remainingLength2 !== undefined && remainingLength2 < MAX_REMAINING_LENGTH_TO_SHOW;
  });

  const dateTarget = createMemo(() => {
    const target = dateEditTarget();
    return target?.type === 'date' ? target : undefined;
  });
  const formattedDateTarget = createMemo(() => {
    const target = dateEditTarget();
    return target?.type === 'formattedDate' ? target : undefined;
  });

  const handleDateClick = (target: RichEditorDateClickTarget) => {
    setDateEditTarget(target);
    openDateEditor();
  };

  const handleCloseDateEditor = () => {
    closeDateEditor();
  };

  const handleDateEditorAnimationEnd = () => {
    setDateEditTarget(undefined);
  };

  const handleDateMarkSubmit = (date: Date) => {
    const dateEditTarget2 = dateEditTarget();
    if (!editor() || dateEditTarget2?.type !== 'date') {
      return;
    }

    editor()!
      .chain()
      .focus()
      .setTextSelection(dateEditTarget2.range)
      .setMark('date', { date: Math.round(date.getTime() / 1000) })
      .run();
    closeDateEditor();
  };

  const handleFormattedDateSubmit = (text: ApiFormattedText) => {
    const dateEditTarget2 = dateEditTarget();
    if (dateEditTarget2?.type !== 'formattedDate') {
      return;
    }

    props.richEditor.replaceRange(dateEditTarget2.range, { type: 'formattedText', text });
    closeDateEditor();
  };

  const updateInputHeight = (willSend = false) => {
    // Defer to avoid animation/layout conflicts during DOM updates
    fastRaf(() => {
      requestForcedReflow(() => {
        const input = inputRef;
        const clone = scrollerCloneRef;
        if (!input || !clone) {
          return undefined;
        }

        const scroller = input.closest<HTMLDivElement>(`.${SCROLLER_CLASS}`);
        if (!scroller) {
          return undefined;
        }

        const currentScroller = scroller;
        const currentHeight = Number(currentScroller.style.height.replace('px', ''));
        const { scrollHeight } = clone;
        let heightLimit = maxInputHeight();
        if (isCollapsedRichOnlyPreview()) {
          const baseHeight = Number.parseFloat(getComputedStyle(currentScroller).minHeight);
          const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight);
          heightLimit = baseHeight + lineHeight * (COLLAPSED_RICH_PREVIEW_LINE_COUNT - 1);
        }
        const newHeight = Math.min(scrollHeight, heightLimit);
        const isOverflown = scrollHeight > heightLimit;
        const isHeightChanged = newHeight !== currentHeight;

        function exec() {
          currentScroller.classList.toggle('overflown', isOverflown);

          if (!isHeightChanged) {
            return;
          }

          const transitionDuration = Math.round(
            TRANSITION_DURATION_FACTOR * Math.log(Math.abs(newHeight - currentHeight)),
          );
          currentScroller.style.height = `${newHeight}px`;
          currentScroller.style.transitionDuration = `${transitionDuration}ms`;
        }

        if (willSend) {
          // Delay to next frame to sync with sending animation
          requestMutation(exec);
          return undefined;
        } else {
          return exec;
        }
      });
    });
  };

  const syncCloneWithSource = (source?: HTMLElement) => {
    const clone = cloneRef;
    if (!source || !clone) {
      clone?.replaceChildren();
      return;
    }

    clone.replaceChildren(...Array.from(source.childNodes).map((child) => child.cloneNode(true)));
  };

  const handleEditorUpdate = (isEmpty: boolean, source: HTMLElement) => {
    if (updateRafRef) {
      cancelAnimationFrame(updateRafRef);
    }

    updateRafRef = requestAnimationFrame(() => {
      updateRafRef = undefined;
      syncCloneWithSource(source);
      updateInputHeight(isEmpty);
    });
  };

  let wasRichOnlyContentRef = props.isRichOnlyContent;
  createEffect(
    depsOf(() => [isMainInput(), props.isRichInputExpanded, props.isRichOnlyContent, props.onRichInputExpand] as const),
    ([isMainInput2, isRichInputExpanded2, isRichOnlyContent2, onRichInputExpand2]) => {
      const shouldExpandRichInput =
        isMainInput2 && !isRichInputExpanded2 && isRichOnlyContent2 && !wasRichOnlyContentRef;
      wasRichOnlyContentRef = isRichOnlyContent2;

      if (shouldExpandRichInput) {
        onRichInputExpand2?.();
      }
    },
  );

  const handleEditorReady = (source: HTMLElement) => {
    syncCloneWithSource(source);
    updateInputHeight();
  };

  const getIsRichInputExpanded = () => Boolean(isMainInput() && props.isRichInputExpanded);
  const handleMediaEdit: RichEditorMediaEditHandler = (uploadId) => {
    props.onMediaEdit?.(uploadId);
  };
  const handleMediaFiles: RichEditorMediaFilesHandler = (files, position, shouldAppend) => {
    props.onMediaFiles?.(files, position, shouldAppend);
  };

  // Deviation: tt rendered the attributes of the input through JSX (`id`, `className`, `contentEditable`, `tabIndex`,
  // `aria-*`) and wrote them again here once the editor was attached. The element is rendered here without them (it is
  // ProseMirror's), so this function is the only writer: it is called when the element is created, by the effect below
  // and by the effects that tt already had. `role`, `dir` and `spellcheck` are static and stay in the JSX.
  const syncEditorElementAttributes = (input: HTMLElement) => {
    input.id = props.editableInputId || EDITABLE_INPUT_ID;
    input.className = buildClassName(className(), 'ProseMirror');
    input.inert = isCollapsedRichOnlyPreview();
    input.setAttribute('role', 'textbox');
    input.setAttribute('dir', 'auto');
    input.setAttribute('tabindex', isCollapsedRichOnlyPreview() ? '-1' : '0');
    input.setAttribute('contenteditable', isRichEditorEditable() ? 'true' : 'false');
    input.toggleAttribute('data-dropzone', Boolean(isMainInput() && props.isRichInputExpanded));
    if (isCollapsedRichOnlyPreview()) {
      input.setAttribute('aria-readonly', 'true');
    } else {
      input.removeAttribute('aria-readonly');
    }
    if (IS_TAURI) {
      input.setAttribute('spellcheck', 'false');
    } else {
      input.removeAttribute('spellcheck');
    }

    if (placeholderAriaLabel()) {
      input.setAttribute('aria-label', placeholderAriaLabel()!);
    } else {
      input.removeAttribute('aria-label');
    }

    // Deviation: `aria-disabled` was a JSX attribute in tt.
    if (!isRichEditorReady()) {
      input.setAttribute('aria-disabled', 'true');
    } else {
      input.removeAttribute('aria-disabled');
    }
  };

  // The input when the editor cannot be rendered (a locked chat): the attributes tt's JSX gave it. It is not a ProseMirror
  // root then.
  const syncPlainInputAttributes = (input: HTMLElement) => {
    input.id = props.editableInputId || EDITABLE_INPUT_ID;
    input.className = className();
    input.setAttribute('contenteditable', 'false');
    input.setAttribute('tabindex', isCollapsedRichOnlyPreview() ? '-1' : '0');
    input.removeAttribute('aria-disabled');
    if (isCollapsedRichOnlyPreview()) {
      input.setAttribute('aria-readonly', 'true');
    } else {
      input.removeAttribute('aria-readonly');
    }

    if (placeholderAriaLabel()) {
      input.setAttribute('aria-label', placeholderAriaLabel()!);
    } else {
      input.removeAttribute('aria-label');
    }
  };

  createMutationEffect(
    depsOf(() => [props.isAttachmentModalInput] as const),
    ([isAttachmentModalInput2]) => {
      if (!isAttachmentModalInput2) return;
      updateInputHeight(false);
    },
  );

  createMutationEffect(
    depsOf(() => [props.isRichInputExpanded] as const),
    ([isRichInputExpanded2]) => {
      if (isRichInputExpanded2) {
        return;
      }

      updateInputHeight(false);
    },
  );

  createEffect(
    depsOf(() => [canRenderRichEditor(), props.isActive, props.richEditor.registerRoot, rootTooltips()] as const),
    ([canRenderRichEditor2, isActive2, registerRichEditorRoot, rootTooltips2]) => {
      const input = inputRef;
      if (!input) {
        return undefined;
      }

      if (!canRenderRichEditor2 || !isActive2) {
        if (!canRenderRichEditor2) {
          input.replaceChildren();
        }
        syncCloneWithSource();
        updateInputHeight();
        return undefined;
      }

      syncEditorElementAttributes(input);
      const unregisterRichEditorRoot = registerRichEditorRoot({
        element: input,
        sharedCanvasRef: () => sharedCanvasRef,
        sharedCanvasHqRef: () => sharedCanvasHqRef,
        tooltips: rootTooltips2,
        getIsRichInputExpanded,
        onReady: handleEditorReady,
        onUpdate: handleEditorUpdate,
        onDateClick: handleDateClick,
        onMediaEdit: handleMediaEdit,
        onMediaFiles: handleMediaFiles,
      });

      return () => {
        if (updateRafRef) {
          cancelAnimationFrame(updateRafRef);
          updateRafRef = undefined;
        }
        unregisterRichEditorRoot();
      };
    },
  );

  createMutationEffect(
    depsOf(
      () =>
        [
          editor(),
          props.isActive,
          isCollapsedRichOnlyPreview(),
          isMainInput(),
          // Not used by the apply, but the editor mode (and its element attributes) follow it.
          props.isRichInputExpanded,
        ] as const,
    ),
    ([editor2, isActive2, isCollapsedRichOnlyPreview2, isMainInput2]) => {
      if (!editor2 || editor2.isDestroyed || !isMainInput2 || !isActive2) {
        return;
      }

      editor2.view.dispatch(
        editor2.state.tr.setMeta(RICH_INPUT_MODE_CHANGED_META, true).setMeta('addToHistory', false),
      );
      editor2.setEditable(!isCollapsedRichOnlyPreview2, false);
      syncEditorElementAttributes(editor2.view.dom);
    },
  );

  const refreshCodeBlockHighlighting = () => {
    const editor2 = editor();
    if (!editor2 || editor2.isDestroyed) {
      return;
    }

    if (!findChildren(editor2.state.doc, (node) => node.type.name === 'codeBlock').length) {
      return;
    }

    editor2.view.dispatch(
      editor2.state.tr.setMeta(CODE_HIGHLIGHTING_CHANGED_META, true).setMeta('addToHistory', false),
    );
    syncCloneWithSource(editor2.view.dom);
    updateInputHeight();
  };

  onMount(() => subscribeToCodeLanguageLoad(throttleWith(requestMutation, refreshCodeBlockHighlighting)));

  createMutationEffect(
    depsOf(() => [editor(), props.isActive, isInputEmpty(), isRichEditorReady(), richValue(), isMounted()] as const),
    ([editor2, isActive2, isInputEmpty2, isRichEditorReady2, , isMounted2], prev) => {
      // Deviation: waits for the element (see `isMounted`); tt's layout effect ran after the commit.
      if (!isMounted2) {
        return;
      }

      if (!isActive2 && inputRef) {
        inputRef.blur();
        updateInputHeight(true);
        return;
      }

      // Perf (composer review): a document change made by typing is synced by `handleEditorUpdate`'s frame callback, which
      // is pending at this point; syncing here too cloned the document twice per keystroke and, as this runs in the mutate
      // phase before the forced-reflow phase of the same frame pass, made the height measure of the previous update a
      // forced layout. tt's layout effect ran outside that pass. Only a value-only change with that callback pending is
      // skipped: a programmatic `setValue` (no editor update) and every other dependency still sync here.
      if (
        updateRafRef !== undefined &&
        prev &&
        prev[0] === editor2 &&
        prev[1] === isActive2 &&
        prev[2] === isInputEmpty2 &&
        prev[3] === isRichEditorReady2 &&
        prev[5] === isMounted2
      ) {
        return;
      }

      if (isRichEditorReady2 && editor2 && !editor2.isDestroyed) {
        syncCloneWithSource(editor2.view.dom);
      }

      updateInputHeight(isInputEmpty2);
    },
  );

  // The first run is the creation of the element (the `ref` callback below).
  createMutationEffect(
    depsOf(
      () =>
        [
          canRenderRichEditor(),
          className(),
          props.editableInputId,
          isCollapsedRichOnlyPreview(),
          props.isNeedPremium,
          isRichEditorEditable(),
          isRichEditorReady(),
          placeholderAriaLabel(),
        ] as const,
    ),
    ([canRenderRichEditor2]) => {
      if (!inputRef) {
        return;
      }

      // Deviation: tt skipped this effect without an editor, its JSX attributes applied then.
      if (canRenderRichEditor2) {
        syncEditorElementAttributes(inputRef);
      } else {
        syncPlainInputAttributes(inputRef);
      }
    },
  );

  const focusInput = () => {
    if (
      !inputRef ||
      !canRenderRichEditor() ||
      !isRichEditorReady() ||
      isCollapsedRichOnlyPreview() ||
      props.isNeedPremium
    ) {
      return;
    }

    focusEditableElement(inputRef);
  };

  const handleDebugDoubleClick = () => {
    if (!DEBUG) {
      return;
    }

    // eslint-disable-next-line no-console
    console.warn('[MessageInput] Tiptap state:', editor(), editor()?.getJSON());
  };

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (e.button !== 2) {
      return;
    }

    if (isContextMenuOpenRef) {
      return;
    }

    isContextMenuOpenRef = true;
    const editor2 = editor();
    if (editor2 && !editor2.isDestroyed) {
      refreshRichEditorTooltips(editor2);
    }

    function handleCloseContextMenu(e2: KeyboardEvent | MouseEvent) {
      if (e2 instanceof KeyboardEvent && e2.key !== 'Esc' && e2.key !== 'Escape') {
        return;
      }

      setTimeout(() => {
        isContextMenuOpenRef = false;
        if (editor2 && !editor2.isDestroyed) {
          refreshRichEditorTooltips(editor2);
        }
      }, CONTEXT_MENU_CLOSE_DELAY_MS);

      window.removeEventListener('keydown', handleCloseContextMenu);
      window.removeEventListener('mousedown', handleCloseContextMenu);
    }

    document.addEventListener('mousedown', handleCloseContextMenu);
    document.addEventListener('keydown', handleCloseContextMenu);
  }

  const isSendShortcut = (e: KeyboardEvent | React.KeyboardEvent<HTMLDivElement>) => {
    const isEnterKey = e.key === 'Enter';
    const isSubmitModifierPressed = e.ctrlKey || e.metaKey;

    if (!isEnterKey || e.shiftKey || isMobileDevice()) {
      return false;
    }

    if (props.isRichInputExpanded) {
      return isSubmitModifierPressed;
    }

    return (
      props.messageSendKeyCombo === 'enter' || (props.messageSendKeyCombo === 'ctrl-enter' && isSubmitModifierPressed)
    );
  };

  const handleSendShortcut = (e: KeyboardEvent | React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    props.onSend();
  };

  // Deviation: a native capture listener on the wrapper (`oncapture:keydown`), tt used React's `onKeyDownCapture`.
  function handleKeyDownCapture(e: KeyboardEvent) {
    if (!(e.target instanceof Node) || !inputRef?.contains(e.target)) {
      return;
    }

    // Capture send shortcuts before ProseMirror handles them as editor commands
    if (!e.isComposing && isSendShortcut(e)) {
      handleSendShortcut(e);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const { isComposing } = e;

    const isEmpty = props.richEditor.isEmpty();
    if (!isComposing && isEmpty && (e.metaKey || e.ctrlKey)) {
      const targetIndexDelta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : undefined;
      if (targetIndexDelta) {
        e.preventDefault();

        replyToNextMessage({ targetIndexDelta });
        return;
      }
    }

    if (!isComposing && e.key === 'Escape' && props.isRichInputExpanded) {
      props.onRichInputCollapse?.();
    } else if (!isComposing && e.key === 'ArrowUp' && isEmpty && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      editLastMessage();
    }
  }

  function handleAndroidContextMenu(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    const editor2 = editor();
    if (!editor2 || editor2.isDestroyed || editor2.state.selection.empty) {
      return;
    }

    isTextFormatterDisabledRef = !isTextFormatterDisabledRef;

    if (!isTextFormatterDisabledRef) {
      e.preventDefault();
      e.stopPropagation();
    }
    refreshRichEditorTooltips(editor2);
  }

  function handleClick() {
    if (props.isAttachmentModalInput || props.canSendPlainText || (props.isStoryInput && props.isNeedPremium)) return;
    showAllowedMessageTypesNotification({ chatId: props.chatId, messageListType: props.messageListType });
  }

  const handleOpenPremiumModal = () => openPremiumModal();

  function handleDeleteUnsupported() {
    if (!richValue()) {
      return;
    }

    const nextValue = removeUnsupportedRichBlocks(richValue());
    props.richEditor.setValue(nextValue.blocks.length ? nextValue : undefined);
    syncCloneWithSource(editor()?.view.dom);
  }

  // Deviation: tt keyed this effect on the `replyInfo` object, a new one per reply. The store merges a new reply into the
  // draft's record in place, so the record keeps its identity: the key is its content (the serialisation reads, and so
  // subscribes to, every field). A repeat of the very same reply does not refocus (tt did).
  const replyInfoKey = () => (props.replyInfo ? JSON.stringify(props.replyInfo) : undefined);

  // Deviation: a measure effect, as `focus()` is a layout read (tt: `useEffect`, also a measure-phase effect).
  createMeasureEffect(
    depsOf(() => [props.chatId, replyInfoKey(), props.canAutoFocus, isRichEditorReady()] as const),
    ([, , canAutoFocus2]) => {
      if (IS_TOUCH_ENV) {
        return;
      }

      if (canAutoFocus2) {
        focusInput();
      }
    },
  );

  createEffect(
    depsOf(
      () =>
        [
          canRenderRichEditor(),
          props.chatId,
          props.editableInputId,
          isCollapsedRichOnlyPreview(),
          isMobileDevice(),
          props.isActive,
          props.isSelectModeActive,
          props.noFocusInterception,
        ] as const,
    ),
    ([
      canRenderRichEditor2,
      chatId2,
      editableInputId2,
      isCollapsedRichOnlyPreview2,
      isMobileDevice2,
      isActive2,
      isSelectModeActive2,
      noFocusInterception2,
    ]) => {
      if (
        !chatId2 ||
        (editableInputId2 !== EDITABLE_INPUT_ID && editableInputId2 !== EDITABLE_INPUT_MODAL_ID) ||
        isMobileDevice2 ||
        isSelectModeActive2
      ) {
        return undefined;
      }

      const handleDocumentKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | undefined;
        const input = inputRef!;

        const shouldHandleDocumentKeyDown =
          canRenderRichEditor2 &&
          !isCollapsedRichOnlyPreview2 &&
          isActive2 &&
          input &&
          target &&
          target !== input &&
          target.tagName !== 'INPUT' &&
          target.tagName !== 'TEXTAREA' &&
          !target.isContentEditable &&
          !hasActiveHandler('Enter');

        if (!shouldHandleDocumentKeyDown) return;

        if (isSendShortcut(e)) {
          handleSendShortcut(e);
          return;
        }

        const { key } = e;
        if (noFocusInterception2 || getIsDirectTextInputDisabled() || IGNORE_KEYS.includes(key)) {
          return;
        }

        const isSelectionCollapsed = document.getSelection()?.isCollapsed;

        if (
          ((key.startsWith('Arrow') || (e.shiftKey && key === 'Shift')) && !isSelectionCollapsed) ||
          (e.code === 'KeyC' && (e.ctrlKey || e.metaKey) && target.tagName !== 'INPUT')
        ) {
          return;
        }

        focusEditableElement(input, true, true);

        const newEvent = new KeyboardEvent(e.type, e);
        input.dispatchEvent(newEvent);
      };

      document.addEventListener('keydown', handleDocumentKeyDown, true);

      return () => {
        document.removeEventListener('keydown', handleDocumentKeyDown, true);
      };
    },
  );

  onMount(() => {
    const captureFirstTab = debounce(
      (e: KeyboardEvent) => {
        if (e.key === 'Tab' && !getIsDirectTextInputDisabled()) {
          e.preventDefault();
          // Deviation: `focus()` is a layout read, tt's `requestMutation` would be a phase violation.
          requestMeasure(focusInput);
        }
      },
      TAB_INDEX_PRIORITY_TIMEOUT,
      true,
      false,
    );

    function handleTab(e: KeyboardEvent) {
      const target = e.target as HTMLElement | undefined;
      if (target?.closest?.(CONTENT_EDITABLE_SELECTOR)) {
        return false;
      }

      captureFirstTab(e);
      return undefined;
    }

    return captureKeyboardListeners({ onTab: handleTab });
  });

  createEffect(
    () => props.shouldSuppressFocus,
    (shouldSuppressFocus2) => {
      const input = inputRef!;

      function suppressFocus() {
        input.blur();
      }

      if (shouldSuppressFocus2) {
        input.addEventListener('focus', suppressFocus);
      }

      return () => {
        input.removeEventListener('focus', suppressFocus);
      };
    },
  );

  return (
    <div
      id={props.id}
      onClick={() => {
        if (props.shouldSuppressFocus) props.onSuppressedFocus?.();
      }}
      dir={lang.isRtl ? 'rtl' : undefined}
    >
      <Show when={hasUnsupportedRichContent()}>
        <div class={tiptapStyles.unsupported}>
          <span>{lang('PageContentUnsupported')}</span>
          <Button
            isText
            size="smaller"
            color="danger"
            className={tiptapStyles.unsupportedDelete}
            onClick={handleDeleteUnsupported}
          >
            {lang('Delete')}
          </Button>
        </div>
      </Show>
      <div class="shared-canvas-container">
        <Show when={canRenderRichEditor()}>
          <canvas
            ref={(el) => {
              sharedCanvasRef = el;
            }}
            class="shared-canvas"
          />
          <canvas
            ref={(el) => {
              sharedCanvasHqRef = el;
            }}
            class="shared-canvas"
          />
        </Show>
        <div
          ref={(el) => {
            scrollerRef = el;
          }}
          class={buildClassName(
            'custom-scroll',
            SCROLLER_CLASS,
            props.isNeedPremium && 'is-need-premium',
            isCollapsedRichOnlyPreview() && 'rich-only-preview',
          )}
          onScroll={(e) => props.onScroll?.(e)}
          onClick={() => {
            if (isCollapsedRichOnlyPreview()) props.onRichInputExpand?.();
            else if (isMainInputLocked()) handleClick();
          }}
        >
          <div class={inputScrollerContentClass()} data-stricterdom-ignore oncapture:keydown={handleKeyDownCapture}>
            <div
              ref={(el) => {
                inputRef = el;
                props.ref?.(el);
                if (canRenderRichEditor()) {
                  syncEditorElementAttributes(el);
                } else {
                  syncPlainInputAttributes(el);
                }
              }}
              role="textbox"
              dir="auto"
              spellcheck={IS_TAURI ? 'false' : undefined}
              onClick={() => {
                if (!isCollapsedRichOnlyPreview()) focusInput();
              }}
              onDblClick={DEBUG ? handleDebugDoubleClick : undefined}
              onKeyDown={handleKeyDown}
              onMouseDown={handleMouseDown}
              onContextMenu={IS_ANDROID ? handleAndroidContextMenu : undefined}
              onFocus={() => {
                if (!props.isNeedPremium) props.onFocus?.();
              }}
              onBlur={() => {
                if (!props.isNeedPremium) props.onBlur?.();
              }}
            />
            <Show when={!props.forcedPlaceholder}>
              <span
                class={buildClassName(
                  'placeholder-text',
                  isMainInputLocked() && 'with-icon',
                  props.isNeedPremium && 'is-need-premium',
                )}
                dir="auto"
              >
                <Show when={isMainInputLocked()}>
                  <Icon name="lock-filled" className="placeholder-icon" />
                </Show>
                {props.placeholder}
                <Show when={props.isStoryInput && props.isNeedPremium}>
                  <Button className="unlock-button" size="tiny" color="adaptive" onClick={handleOpenPremiumModal}>
                    {oldLang('StoryRepliesLockedButton')}
                  </Button>
                </Show>
              </span>
            </Show>
          </div>
        </div>
      </div>
      <div
        ref={(el) => {
          scrollerCloneRef = el;
        }}
        aria-hidden="true"
        class={buildClassName('custom-scroll', SCROLLER_CLASS, 'clone', props.isNeedPremium && 'is-need-premium')}
      >
        <div class={inputScrollerContentClass()} data-stricterdom-ignore>
          <div
            ref={(el) => {
              cloneRef = el;
            }}
            class={buildClassName(className(), 'clone', tiptapStyles.clone)}
            dir="auto"
          />
        </div>
      </div>
      <Show when={canShowLengthIndicator()}>
        <div class={buildClassName('max-length-indicator', remainingLength()! < 0 && 'color-danger')} dir="auto">
          <AnimatedCounter text={remainingLength()!.toString()} />
        </div>
      </Show>
      <Show when={isMainInput() && canRenderRichEditor()}>
        <RichEditorToolbar
          editor={editor()}
          isEnabled={props.isRichInputExpanded}
          onOpenAiEditor={props.onOpenAiEditor}
        />
      </Show>
      <Show when={dateTarget()} keyed>
        {(target) => (
          <CalendarModal
            isOpen={isDateEditorOpen()}
            selectedAt={target.date * 1000}
            withTimePicker
            submitButtonLabel={lang('Save')}
            onClose={handleCloseDateEditor}
            onCloseAnimationEnd={handleDateEditorAnimationEnd}
            onSubmit={handleDateMarkSubmit}
          />
        )}
      </Show>
      <Show when={formattedDateTarget()} keyed>
        {(target) => (
          <FormattedDateModal
            isOpen={isDateEditorOpen()}
            initialDate={target.date}
            initialOptions={target.options}
            onClose={handleCloseDateEditor}
            onCloseAnimationEnd={handleDateEditorAnimationEnd}
            onSubmit={handleFormattedDateSubmit}
          />
        )}
      </Show>
      <Show when={props.forcedPlaceholder}>
        <span class="forced-placeholder">{renderText(props.forcedPlaceholder)}</span>
      </Show>
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { chatId, threadId }: OwnProps): Complete<StateProps> => {
  const { messageSendKeyCombo } = selectSharedSettings(global);

  return {
    messageSendKeyCombo,
    replyInfo: chatId && threadId ? selectDraft(global, chatId, threadId)?.replyInfo : undefined,
    isSelectModeActive: selectIsInSelectMode(global),
  };
};

export default MessageInput;

function getRichInputLength(value: ApiInputRichMessage) {
  const formattedValue = getRichInputAsFormatted(value);
  if (formattedValue) {
    return getUtf8Length(formattedValue.text);
  }

  return getRichMessageUsage(value).textLength;
}
