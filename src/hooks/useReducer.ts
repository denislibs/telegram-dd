import useForceUpdate from './useForceUpdate';

export type ReducerAction<Actions> = { type: Actions; payload?: any };
export type StateReducer<State, Actions> = (state: State, action: ReducerAction<Actions>) => State;
export type Dispatch<State, Actions> = (action: ReducerAction<Actions>) => State;

// TODO(codemod): useReducer: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useReducer<State, Actions>(reducer: StateReducer<State, Actions>, initialState: State) {
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();
  let reducerRef = reducer;
  let stateRef = initialState;

  const dispatch = (action: ReducerAction<Actions>) => {
    stateRef = reducerRef(stateRef, action);
    forceUpdate();
    return stateRef;
  };

  return [stateRef, dispatch] as [State, Dispatch<State, Actions>];
}
