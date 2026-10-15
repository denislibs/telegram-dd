import { createContext, createMemo, useContext } from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';

import useClickable from '../../../hooks/useClickable';

import RippleEffect from '../../ui/RippleEffect';

import styles from './Interactive.module.scss';

export type InteractiveContextType = {
  isDisabled: boolean;
  isLoading: boolean;
  isLabel: boolean;
};

export const InteractiveContext = createContext<InteractiveContextType | undefined>(undefined);

// Deviation: tt's `useContext` hook (hooks/data/useContext.ts) is frameact's `useContext`. A provider passes an object
// with getters, so a consumer reads `interactive?.isLoading` where it is used (JSX, memo) and stays reactive.
export function useInteractiveContext() {
  return useContext(InteractiveContext);
}

type OwnProps = {
  asLabel?: boolean;
  clickable?: boolean;
  ripple?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  children: JSX.Element;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
};

const Interactive = (props: OwnProps) => {
  // Deviation: the context value is one object with getters (the provider reads its value once).
  const contextValue: InteractiveContextType = {
    get isDisabled() {
      return Boolean(props.disabled);
    },
    get isLoading() {
      return Boolean(props.loading);
    },
    get isLabel() {
      return Boolean(props.asLabel);
    },
  };

  const isNonInteractive = createMemo(() => props.disabled || props.loading);
  const clickableProps = useClickable<HTMLElement>(() => props.onClick, {
    disabled: isNonInteractive,
    withA11y: () => !props.asLabel,
  });

  const blockClassName = createMemo(() =>
    buildClassName(
      styles.interactive,
      props.clickable && !isNonInteractive() && styles.clickable,
      isNonInteractive() && styles.nonInteractive,
      props.disabled && styles.disabled,
      props.className,
    ),
  );

  // Deviation: a function, not a constant: the label and the div branch are separate, and a JSX constant is one node.
  const content = () => (
    <>
      {props.children}
      {props.ripple && !isNonInteractive() && <RippleEffect />}
    </>
  );

  return (
    <Show
      when={!props.asLabel}
      fallback={
        <InteractiveContext.Provider value={contextValue}>
          <label class={blockClassName()} {...clickableProps}>
            {content()}
          </label>
        </InteractiveContext.Provider>
      }
    >
      <InteractiveContext.Provider value={contextValue}>
        <div class={blockClassName()} {...clickableProps}>
          {content()}
        </div>
      </InteractiveContext.Provider>
    </Show>
  );
};

export default Interactive;
