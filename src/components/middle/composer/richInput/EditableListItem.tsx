import { createMemo } from 'frameact';

import { NodeViewContent, type TeactNodeViewComponentProps } from '../../../../util/tiptap';
import styles from '../../../../util/tiptap/styling.module.scss';

import useLang from '../../../../hooks/useLang';

import Checkbox from '../../../gili/primitives/Checkbox';

const EditableListItem = (props: TeactNodeViewComponentProps) => {
  const lang = useLang();
  const hasCheckbox = createMemo(() => Boolean(props.node.attrs.checkbox));
  const isChecked = createMemo(() => Boolean(props.node.attrs.checked));

  const handleMouseDown = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
  };

  const handleChange = (checked: boolean) => {
    if (!props.editor.isEditable) {
      return;
    }

    props.updateAttributes({ checked });
  };

  return (
    <div class={hasCheckbox() ? styles.listCheckboxItem : undefined}>
      <span
        class={styles.listCheckboxWrapper}
        contentEditable={false}
        hidden={!hasCheckbox()}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        {hasCheckbox() && <Checkbox checked={isChecked()} aria-label={lang('TitleTask')} onChange={handleChange} />}
      </span>
      <NodeViewContent className={hasCheckbox() ? styles.listItemContent : undefined} />
    </div>
  );
};

export default EditableListItem;
