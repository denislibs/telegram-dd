import { createContext, createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';

import useContext from '../../../hooks/data/useContext';
import useClickable from '../../../hooks/useClickable';

import RippleEffect from '../../ui/RippleEffect';

import styles from './Interactive.module.scss';

export type InteractiveContextType = {
  isDisabled: boolean;
  isLoading: boolean;
  isLabel: boolean;
};

export const InteractiveContext = createContext<InteractiveContextType | undefined>(undefined);

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
  const contextValue = createMemo(() => ({
    isDisabled: Boolean(props.disabled),
    isLoading: Boolean(props.loading),
    isLabel: Boolean(props.asLabel),
  }));

  const isNonInteractive = createMemo(() => props.disabled || props.loading);
  const clickableProps = useClickable(props.onClick, {
    disabled: () => isNonInteractive(),
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

  const content = (
    <>
      {props.children}
      {props.ripple && !isNonInteractive() && <RippleEffect />}
    </>
  );

  return (
    <Show
      when={!props.asLabel}
      fallback={
        <InteractiveContext.Provider value={contextValue()}>
          <label class={blockClassName()} {...clickableProps}>
            {content}
          </label>
        </InteractiveContext.Provider>
      }
    >
      <InteractiveContext.Provider value={contextValue()}>
        <div class={blockClassName()} {...clickableProps}>
          {content}
        </div>
      </InteractiveContext.Provider>
    </Show>
  );
};

export default Interactive;
