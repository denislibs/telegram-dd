// FOUNDATION STUB: TodoList (telegram-tt src/components/middle/message/TodoList.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMediaTodo, ApiMessage } from '../../../api/types';

import { clampCount, PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export type OwnProps = {
  message: ApiMessage;
  todoList: ApiMediaTodo;
};

const MAX_ITEMS = 30;
// The header, one row per item and the completed tasks counter.
const HEADER_HEIGHT_REM = 2.5;
const ITEM_HEIGHT_REM = 1.75;
const FOOTER_HEIGHT_REM = 1.5;

// TODO(port): the real TodoList (title, items with checkboxes, completed tasks counter).
const TodoList = (props: OwnProps) => {
  const height = () =>
    HEADER_HEIGHT_REM + clampCount(props.todoList.todo.items.length, MAX_ITEMS) * ITEM_HEIGHT_REM + FOOTER_HEIGHT_REM;

  return (
    <div
      role="img"
      aria-label="Checklist, not supported yet"
      class="todo-list"
      style={`min-width: 15rem; height: ${height()}rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default TodoList;
