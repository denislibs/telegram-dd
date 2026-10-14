import { type Accessor, createSignal } from 'frameact';

export type ReducerAction<Actions> = { type: Actions; payload?: any };
export type StateReducer<State, Actions> = (state: State, action: ReducerAction<Actions>) => State;
export type Dispatch<State, Actions> = (action: ReducerAction<Actions>) => State;

// Deviation: the state is a signal (frameact components run once, there is no `useForceUpdate`): the hook returns an
// accessor of the state. `dispatch` reduces the committed value, so two dispatches in one tick see each other.
export default function useReducer<State, Actions>(reducer: StateReducer<State, Actions>, initialState: State) {
  const [state, setState] = createSignal(initialState);
  let current = initialState;

  const dispatch = (action: ReducerAction<Actions>) => {
    current = reducer(current, action);
    setState(() => current);
    return current;
  };

  return [state, dispatch] as [Accessor<State>, Dispatch<State, Actions>];
}
