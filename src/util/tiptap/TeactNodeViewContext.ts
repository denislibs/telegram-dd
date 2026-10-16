import { createContext, useContext } from 'frameact';

export type TeactNodeViewContextValue = {
  contentDOMElement?: HTMLElement;
};

export const TeactNodeViewContext = createContext<TeactNodeViewContextValue>({
  contentDOMElement: undefined,
});

// Deviation: tt's `useContext` hook (hooks/data/useContext.ts) is frameact's own `useContext`; call it in a component body.
export function useTeactNodeViewContext() {
  return useContext(TeactNodeViewContext);
}
