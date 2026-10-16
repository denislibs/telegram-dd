import type { Editor } from '@tiptap/core';
import { createEffect, createMemo, createSignal } from 'frameact';
import { Show } from 'frameact/dom';

import type { IconName } from '../../../types/icons';
import type { RichEditorFormatterState } from '../../common/tooltips/types';

import { normalizeButtonText } from '../../../global/helpers/buttons';
import { formatLinkUrl } from '../../../util/browser/url';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';
import stopEvent from '../../../util/stopEvent';
import { EMPTY_RICH_BUTTON } from '../../../util/tiptap/richButton';
import { isRichEditorBlockquoteActive } from './richEditorFormatting';
import { buildRichTextFromTiptapContent, buildTiptapInlineContentFromRichText } from './richText';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';

import CalendarModal from '../../common/CalendarModal';
import Button from '../Button';
import TextFormatterInput from './TextFormatterInput';

import styles from './TextFormatter.module.scss';

type EditorRange = { from: number; to: number };

export type OwnProps = {
  editor: Editor;
  range: EditorRange;
  capabilities: 'basic' | 'full';
  controlRequest?: RichEditorFormatterState['controlRequest'];
  isRichInputExpanded?: boolean;
  onClose: NoneToVoidFunction;
  onDismissalChange: (isBlocked: boolean) => void;
};

interface SelectedTextFormats {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  monospace?: boolean;
  spoiler?: boolean;
  marked?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  blockquote?: boolean;
}

type SelectedTextFormat = keyof SelectedTextFormats;

const TEXT_FORMAT_KEYS: SelectedTextFormat[] = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'monospace',
  'spoiler',
  'marked',
  'subscript',
  'superscript',
  'blockquote',
];
const MARK_NAME_BY_TEXT_FORMAT: Partial<Record<SelectedTextFormat, string>> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strike',
  monospace: 'code',
  spoiler: 'spoiler',
  marked: 'marked',
  subscript: 'subscript',
  superscript: 'superscript',
};

const TextFormatter = (props: OwnProps) => {
  const [isLinkControlOpen, openLinkControl, closeLinkControl] = useFlag();
  const [isDatePickerOpen, openDatePicker, closeDatePicker] = useFlag();
  const [linkUrl, setLinkUrl] = createSignal('');
  const [selectedDateAt, setSelectedDateAt] = createSignal(roundDateToMinute(new Date()).getTime());

  const lang = useLang();

  // Deviation: tt recomputed the selection state on every render of the component. Here it is a memo over the props and
  // a version of the editor that is bumped by each transaction (a toggled mark or an edit under the same range).
  const [editorVersion, setEditorVersion] = createSignal(0);
  createEffect(
    () => props.editor,
    (editor2) => {
      const handleTransaction = () => setEditorVersion((version) => version + 1);
      editor2.on('transaction', handleTransaction);
      return () => editor2.off('transaction', handleTransaction);
    },
  );

  const getSelectedEditorTextStateResult = createMemo(() => {
    editorVersion();
    return getSelectedEditorTextState(
      props.editor,
      clampRangeToDocument(props.editor, props.range),
      Boolean(props.isRichInputExpanded),
    );
  });
  const selectedTextFormats = () => getSelectedEditorTextStateResult().formats;
  const hasSelectedTextFormatting = () => getSelectedEditorTextStateResult().hasFormatting;
  const selectedLinkHref = createMemo(() => {
    editorVersion();
    return getSelectedLinkHref(props.editor, clampRangeToDocument(props.editor, props.range));
  });

  createEffect(
    () => isLinkControlOpen(),
    (isLinkControlOpen2) => {
      if (!isLinkControlOpen2) {
        setLinkUrl('');
      }
    },
  );

  createEffect(
    () => props.editor,
    (editor2) => {
      return () => {
        if (!editor2.isDestroyed) {
          editor2.commands.setFormatterSelectionHighlight(false);
        }
      };
    },
  );

  createEffect(
    depsOf(() => [isDatePickerOpen(), props.onDismissalChange] as const),
    ([isDatePickerOpen2, onDismissalChange2]) => {
      onDismissalChange2(isDatePickerOpen2);
      return () => onDismissalChange2(false);
    },
  );

  const restoreEditorSelection = () => {
    if (props.editor.isDestroyed) {
      return false;
    }

    return props.editor.chain().focus().setTextSelection(props.range).run();
  };

  function getFormatButtonClassName(key: SelectedTextFormat) {
    return selectedTextFormats()[key] ? 'active' : undefined;
  }

  function isFormatButtonDisabled(key: SelectedTextFormat) {
    if (selectedTextFormats()[key]) {
      return false;
    }
    if (key === 'subscript') {
      return Boolean(selectedTextFormats().superscript);
    }
    if (key === 'superscript') {
      return Boolean(selectedTextFormats().subscript);
    }

    return key !== 'monospace' && key !== 'blockquote' && Boolean(selectedTextFormats().monospace);
  }

  const handleToggleEditorMark = (format: SelectedTextFormat) => {
    if (!restoreEditorSelection()) {
      return;
    }

    const markName = MARK_NAME_BY_TEXT_FORMAT[format]!;
    const chain = props.editor.chain();
    if (selectedTextFormats()[format]) {
      chain.unsetMark(markName).run();
    } else {
      chain.setMark(markName).run();
    }
  };

  const handleClearFormatting = () => {
    if (!restoreEditorSelection()) {
      return;
    }

    props.editor.chain().unsetAllMarks({ ignoreClearable: true }).run();
  };

  const handleStructuralText = (format: 'blockquote' | 'code') => {
    if (!restoreEditorSelection()) {
      return;
    }

    const chain = props.editor.chain();
    if (format === 'code') {
      chain.toggleSelectionCode().run();
    } else {
      chain.toggleSelectionBlockquote().run();
    }
  };

  const handleOpenLinkControl = () => {
    if (!restoreEditorSelection()) {
      return;
    }

    // The href as it was before the commands below (tt read the value of the render).
    const href = selectedLinkHref();
    const commandChain = props.editor.chain();
    if (href !== undefined) {
      commandChain.extendMarkRange('link');
    }
    commandChain.setFormatterSelectionHighlight(true).run();
    if (href !== undefined) {
      setLinkUrl(href);
    }
    openLinkControl();
  };

  const handleCloseLinkControl = () => {
    if (restoreEditorSelection()) {
      props.editor.commands.setFormatterSelectionHighlight(false);
    }
    closeLinkControl();
  };

  const handleLinkUrlConfirm = () => {
    if (!restoreEditorSelection()) {
      return;
    }

    const commandChain = props.editor.chain();
    if (!linkUrl().trim()) {
      commandChain.unsetLink().run();
    } else {
      commandChain.setLink({ href: formatLinkUrl(linkUrl()) }).run();
    }
    props.onClose();
  };

  const handleInsertButton = () => {
    if (!restoreEditorSelection()) return;
    const content = props.editor.state.doc.slice(props.range.from, props.range.to).content.toJSON();
    const text = normalizeButtonText(buildRichTextFromTiptapContent(content));
    props.editor
      .chain()
      .insertContent({ ...EMPTY_RICH_BUTTON, content: buildTiptapInlineContentFromRichText(text) })
      .run();
    props.onClose();
  };

  const handleOpenDatePicker = () => {
    closeLinkControl();
    setSelectedDateAt(roundDateToMinute(new Date()).getTime());
    openDatePicker();
  };

  const handleFormattedDateConfirm = (date: Date) => {
    const text = props.editor.state.doc.textBetween(props.range.from, props.range.to, '\n', '\n');
    if (!text || !restoreEditorSelection()) {
      return;
    }

    props.editor
      .chain()
      .setMark('date', {
        date: Math.round(date.getTime() / 1000),
      })
      .run();
    closeDatePicker();
    props.onClose();
  };

  // `controlRequest` is a plain value of the formatter state (a new object per request), compared by identity as in tt.
  createEffect(
    () => props.controlRequest,
    (controlRequest2) => {
      if (controlRequest2?.control === 'link') {
        handleOpenLinkControl();
      } else if (controlRequest2?.control === 'date') {
        handleOpenDatePicker();
      }
    },
  );

  const className = createMemo(() => buildClassName(styles.root, isLinkControlOpen() && styles.linkControlShown));

  return (
    <div class={className()} data-text-formatter role="toolbar" onMouseDown={stopEvent}>
      <div class={buildClassName(styles.buttons, 'no-scrollbar')}>
        <FormatButton
          ariaLabel={lang('RichEditorBlockquote')}
          className={getFormatButtonClassName('blockquote')}
          iconName="blockquote"
          onClick={() => handleStructuralText('blockquote')}
        />
        <FormatButton
          ariaLabel={lang('FormattingSpoilerAria')}
          className={getFormatButtonClassName('spoiler')}
          iconName="spoiler-text"
          isDisabled={isFormatButtonDisabled('spoiler')}
          onClick={() => handleToggleEditorMark('spoiler')}
        />
        <div class={styles.divider} />
        <FormatButton
          ariaLabel={lang('FormattingBoldAria')}
          className={getFormatButtonClassName('bold')}
          iconName="bold"
          isDisabled={isFormatButtonDisabled('bold')}
          onClick={() => handleToggleEditorMark('bold')}
        />
        <FormatButton
          ariaLabel={lang('FormattingItalicAria')}
          className={getFormatButtonClassName('italic')}
          iconName="italic"
          isDisabled={isFormatButtonDisabled('italic')}
          onClick={() => handleToggleEditorMark('italic')}
        />
        <FormatButton
          ariaLabel={lang('FormattingUnderlineAria')}
          className={getFormatButtonClassName('underline')}
          iconName="underlined"
          isDisabled={isFormatButtonDisabled('underline')}
          onClick={() => handleToggleEditorMark('underline')}
        />
        <FormatButton
          ariaLabel={lang('FormattingStrikethroughAria')}
          className={getFormatButtonClassName('strikethrough')}
          iconName="strikethrough"
          isDisabled={isFormatButtonDisabled('strikethrough')}
          onClick={() => handleToggleEditorMark('strikethrough')}
        />
        <FormatButton
          ariaLabel={lang('FormattingMonospaceAria')}
          className={getFormatButtonClassName('monospace')}
          iconName="monospace"
          onClick={() => handleStructuralText('code')}
        />
        <div class={styles.divider} />
        <FormatButton ariaLabel={lang('FormattingAddDateAria')} iconName="calendar" onClick={handleOpenDatePicker} />
        <FormatButton
          ariaLabel={lang(selectedLinkHref() !== undefined ? 'EditLink' : 'FormattingAddLinkAria')}
          iconName="link"
          onClick={handleOpenLinkControl}
        />
        <Show when={props.capabilities === 'full' && props.isRichInputExpanded}>
          <FormatButton ariaLabel={lang('RichButtonInline')} iconName="button" onClick={handleInsertButton} />
          <div class={styles.divider} />
          <FormatButton
            ariaLabel={lang('FormattingMarkedAria')}
            className={buildClassName(styles.markButton, getFormatButtonClassName('marked'))}
            iconName="mark"
            hasPremiumBadge
            isDisabled={isFormatButtonDisabled('marked')}
            onClick={() => handleToggleEditorMark('marked')}
          />
          <FormatButton
            ariaLabel={lang('FormattingSubscriptAria')}
            className={getFormatButtonClassName('subscript')}
            iconName="subscript"
            hasPremiumBadge
            isDisabled={isFormatButtonDisabled('subscript')}
            onClick={() => handleToggleEditorMark('subscript')}
          />
          <FormatButton
            ariaLabel={lang('FormattingSuperscriptAria')}
            className={getFormatButtonClassName('superscript')}
            iconName="superscript"
            hasPremiumBadge
            isDisabled={isFormatButtonDisabled('superscript')}
            onClick={() => handleToggleEditorMark('superscript')}
          />
        </Show>
        <div class={styles.divider} />
        <FormatButton
          ariaLabel={lang('FormattingClearAria')}
          iconName="clear-formatting"
          isDisabled={!hasSelectedTextFormatting()}
          onClick={handleClearFormatting}
        />
      </div>
      <div
        class={buildClassName(styles.linkControl, styles.inputPopup)}
        aria-hidden={isLinkControlOpen() ? 'false' : 'true'}
        inert={!isLinkControlOpen()}
      >
        <TextFormatterInput
          value={linkUrl()}
          placeholder={lang('FormattingEnterUrl')}
          ariaLabel={lang('FormattingEnterUrl')}
          isActive={isLinkControlOpen()}
          leadingButtonIconName="arrow-left"
          leadingButtonAriaLabel={lang('Cancel')}
          canSubmitEmpty={selectedLinkHref() !== undefined}
          inputMode="url"
          dir="auto"
          onChange={setLinkUrl}
          onSubmit={handleLinkUrlConfirm}
          onDeleteEmpty={handleLinkUrlConfirm}
          onLeadingButtonClick={handleCloseLinkControl}
        />
      </div>
      <CalendarModal
        isOpen={isDatePickerOpen()}
        selectedAt={selectedDateAt()}
        withTimePicker
        submitButtonLabel={lang('Save')}
        onClose={closeDatePicker}
        onDateChange={(date) => setSelectedDateAt(date.getTime())}
        onSubmit={handleFormattedDateConfirm}
      />
    </div>
  );
};

export default TextFormatter;

function FormatButton(props: {
  ariaLabel: string;
  className?: string;
  iconName: IconName;
  hasPremiumBadge?: boolean;
  isDisabled?: boolean;
  onClick: NoneToVoidFunction;
}) {
  return (
    <Button
      color="translucent"
      ariaLabel={props.ariaLabel}
      className={props.className}
      iconName={props.iconName}
      iconHasPremiumBadge={props.hasPremiumBadge}
      disabled={props.isDisabled}
      onClick={props.onClick}
    />
  );
}

function roundDateToMinute(date: Date) {
  const nextDate = new Date(date.getTime());
  nextDate.setSeconds(0);
  nextDate.setMilliseconds(0);
  return nextDate;
}

// Deviation: the memos above re-run on every editor transaction, tt's render ran only when the tooltip controller handed
// over new props. A transaction can shorten the document (sending clears it) before the controller closes the formatter,
// and ProseMirror throws on a position past the end.
function clampRangeToDocument(editor: Editor, range: EditorRange): EditorRange {
  const size = editor.state.doc.content.size;
  return { from: Math.min(range.from, size), to: Math.min(range.to, size) };
}

function getSelectedLinkHref(editor: Editor, range: EditorRange) {
  const linkMark = editor.schema.marks.link;
  let href: string | undefined;
  editor.state.doc.nodesBetween(range.from, range.to, (node) => {
    const mark = linkMark && linkMark.isInSet(node.marks);
    if (mark && typeof mark.attrs.href === 'string') {
      href = mark.attrs.href;
    }
  });
  return href;
}

function getSelectedEditorTextState(editor: Editor, range: EditorRange, isRichInputExpanded: boolean) {
  const selectedFormats: SelectedTextFormats = {};
  const { doc, schema } = editor.state;
  let hasFormatting = false;

  TEXT_FORMAT_KEYS.forEach((format) => {
    const markName = MARK_NAME_BY_TEXT_FORMAT[format];
    if (markName && schema.marks[markName]) {
      selectedFormats[format] = doc.rangeHasMark(range.from, range.to, schema.marks[markName]);
    }
  });
  doc.nodesBetween(range.from, range.to, (node) => {
    hasFormatting ||= Boolean(node.marks.length);
    selectedFormats.monospace ||= node.type.name === 'codeBlock';
  });
  selectedFormats.blockquote = isRichEditorBlockquoteActive(editor, range, isRichInputExpanded);

  return {
    formats: selectedFormats,
    hasFormatting,
  };
}
