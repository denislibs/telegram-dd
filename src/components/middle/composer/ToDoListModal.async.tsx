// FOUNDATION STUB: ToDoListModal.async (telegram-tt src/components/middle/composer/ToDoListModal.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the sync ToDoListModal is not in src yet, so its OwnProps are copied here and exported from this file.
import type { ApiNewMediaTodo } from '../../../api/types';
import type { TabState } from '../../../global/types/tabState';

export type OwnProps = {
  modal: TabState['todoListModal'];
  onSend: (todoList: ApiNewMediaTodo) => void;
  onClear: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ToDoListModalAsync = (_props: OwnProps) => undefined;

export default ToDoListModalAsync;
