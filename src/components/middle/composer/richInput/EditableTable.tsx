// FOUNDATION STUB: EditableTable (telegram-tt src/components/middle/composer/richInput/EditableTable.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';

type EditableTableCommands = Pick<Editor['commands'], 'deleteColumn' | 'deleteRow' | 'deleteTable'>;

export type EditableTableProps = {
  editorView: EditorView;
  editorCommands: EditableTableCommands;
  rootElement: HTMLDivElement;
  tableElement: HTMLTableElement;
  colgroupElement: HTMLTableColElement;
  contentElement: HTMLTableSectionElement;
  renderVersion: number;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const EditableTable = (_props: EditableTableProps) => undefined;

export default EditableTable;
