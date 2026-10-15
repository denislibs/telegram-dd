import { createEffect, createMemo, createMutationEffect, createSignal } from 'frameact';
import { Show } from 'frameact/dom';

import type { IAnchorPosition } from '../../../../types';

import buildClassName from '../../../../util/buildClassName';
import { getPrettyCodeLanguageName, SUPPORTED_CODE_LANGUAGES } from '../../../../util/codeLanguages';
import { ensureCodeLanguage, requestCodeBlockHighlightRefresh } from '../../../../util/highlightCode';
import { fastRaf } from '../../../../util/schedulers';
import { type TeactNodeViewComponentProps } from '../../../../util/tiptap';

import useFlag from '../../../../hooks/useFlag';
import useLang from '../../../../hooks/useLang';

import Icon from '../../../common/icons/Icon';
import Menu from '../../../ui/Menu';
import MenuItem from '../../../ui/MenuItem';

import styles from './EditableCodeBlock.module.scss';

const CODE_BLOCK_TEXT_SEPARATOR = '\n';

const EditableCodeBlock = (props: TeactNodeViewComponentProps) => {
  let triggerRef!: HTMLButtonElement;
  let menuRef: HTMLDivElement | undefined;
  const [isMenuOpen, openMenu, closeMenu] = useFlag();
  const [menuAnchor, setMenuAnchor] = createSignal<IAnchorPosition | undefined>(undefined);
  const lang = useLang();

  const language = createMemo(() =>
    typeof props.node.attrs.language === 'string' ? props.node.attrs.language : undefined,
  );
  const languageLabel = createMemo(() => {
    const currentLanguage = language();
    return currentLanguage ? getPrettyCodeLanguageName(currentLanguage) : lang('RichEditorCodeLanguageAuto');
  });
  const isCodeBlockEmpty = createMemo(() => !props.node.textContent);
  const codeBlockClassName = createMemo(() =>
    buildClassName(styles.codeBlock, typeof props.HTMLAttributes.class === 'string' && props.HTMLAttributes.class),
  );

  // Deviation: tt's ref callback re-ran on every render and also refreshed the class name of the ProseMirror content
  // element. The ref runs once here (the element is still detached), the class name is a mutation effect. The content
  // element belongs to ProseMirror, so frameact only moves it into the wrapper and sets its class.
  function handleCodeBlockWrapperRef(element?: HTMLDivElement) {
    if (!element || !props.contentDOMElement) {
      return;
    }

    if (props.contentDOMElement.parentElement !== element) {
      element.prepend(props.contentDOMElement);
    }
  }

  createMutationEffect(
    () => codeBlockClassName(),
    (className) => {
      if (props.contentDOMElement) {
        props.contentDOMElement.className = className;
      }
    },
  );

  createEffect(
    () => language(),
    (language2) => {
      if (language2) {
        void ensureCodeLanguage(language2);
        return;
      }

      SUPPORTED_CODE_LANGUAGES.forEach((langCode) => {
        void ensureCodeLanguage(langCode);
      });
    },
  );

  const handleTriggerMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleTriggerClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const trigger = triggerRef;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    setMenuAnchor({
      x: rect.left,
      y: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    openMenu();
  };

  const handleCloseMenu = () => {
    closeMenu();
  };

  const handleSetLanguage = (newLanguage?: string) => {
    closeMenu();

    if ((newLanguage || undefined) === language()) {
      return;
    }

    fastRaf(() => {
      void updateCodeBlockLanguage(newLanguage);
    });
  };

  const updateCodeBlockLanguage = async (newLanguage?: string) => {
    const pos = props.getPos();
    if (typeof pos !== 'number') {
      props.editor.commands.focus();
      return;
    }

    const didUpdate = props.editor.commands.command(({ tr, state }) => {
      const currentNode = tr.doc.nodeAt(pos);
      if (!currentNode || currentNode.type.name !== props.node.type.name) {
        return false;
      }

      const attrs = { ...currentNode.attrs, language: newLanguage || undefined };

      if (!currentNode.type.validContent(currentNode.content)) {
        const plainText = currentNode.textBetween(
          0,
          currentNode.content.size,
          CODE_BLOCK_TEXT_SEPARATOR,
          CODE_BLOCK_TEXT_SEPARATOR,
        );
        const content = plainText ? state.schema.text(plainText) : undefined;
        tr.replaceWith(pos + 1, pos + currentNode.nodeSize - 1, content || []);
      }

      tr.setNodeMarkup(pos, undefined, attrs);
      return true;
    });

    if (!didUpdate) {
      props.editor.commands.focus();
      return;
    }

    if (newLanguage) {
      await ensureCodeLanguage(newLanguage);
    }

    requestCodeBlockHighlightRefresh();
    props.editor.commands.focus();
  };

  const getTriggerElement = () => triggerRef;
  const getRootElement = () => document.body;
  const getMenuElement = () => menuRef;
  const getMenuLayout = () => ({ withPortal: true });

  return (
    <div class={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        class={buildClassName(styles.languageButton, 'no-selection')}
        contenteditable="false"
        tabIndex={-1}
        aria-label={lang('Language')}
        onMouseDown={handleTriggerMouseDown}
        onClick={handleTriggerClick}
      >
        {languageLabel()}
        <Icon name="dropdown-arrows" className={styles.languageIcon} />
      </button>
      <div ref={handleCodeBlockWrapperRef} class={styles.codeBlockWrapper}>
        <Show when={isCodeBlockEmpty()}>
          <div class={styles.placeholder} contenteditable="false" aria-hidden="true">
            {lang('RichEditorBlockPlaceholder')}
          </div>
        </Show>
      </div>
      <Menu
        ref={(el) => {
          menuRef = el;
        }}
        isOpen={isMenuOpen()}
        anchor={menuAnchor()}
        ariaLabel={lang('Language')}
        getTriggerElement={getTriggerElement}
        getRootElement={getRootElement}
        getMenuElement={getMenuElement}
        getLayout={getMenuLayout}
        bubbleClassName={styles.languageMenu}
        autoClose
        withPortal
        onClose={handleCloseMenu}
      >
        <div class={buildClassName(styles.languageItems, 'custom-scroll')}>
          <MenuItem
            customIcon={language() ? <Icon name="placeholder" /> : <Icon name="check" />}
            withPreventDefaultOnMouseDown
            onClick={() => handleSetLanguage(undefined)}
          >
            {lang('RichEditorCodeLanguageAuto')}
          </MenuItem>
          {SUPPORTED_CODE_LANGUAGES.map((langCode) => (
            <MenuItem
              customIcon={language() === langCode ? <Icon name="check" /> : <Icon name="placeholder" />}
              withPreventDefaultOnMouseDown
              onClick={() => handleSetLanguage(langCode)}
            >
              {getPrettyCodeLanguageName(langCode)}
            </MenuItem>
          ))}
        </div>
      </Menu>
    </div>
  );
};

export default EditableCodeBlock;
