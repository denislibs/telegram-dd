import { createContext, createMemo, useContext } from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { IconName } from '../../../types/icons';

import buildClassName from '../../../util/buildClassName';

import useLang from '../../../hooks/useLang';
import useUniqueId from '../../../hooks/useUniqueId';

import Icon from '../../common/icons/Icon';
import Spinner from '../../ui/Spinner';
import { useInteractiveContext } from './Interactive';

import styles from './Control.module.scss';

export type ControlContextType = {
  id: string;
  inputClassName: string;
};

export const ControlContext = createContext<ControlContextType | undefined>(undefined);

// Deviation: tt's `useContext` hook (hooks/data/useContext.ts) is frameact's `useContext`.
export function useControlContext() {
  return useContext(ControlContext);
}

// #region Control

type ControlProps = {
  inputEnd?: boolean;
  className?: string;
  children: JSX.Element;
};

const Control = (props: ControlProps) => {
  const uniqueId = useUniqueId();
  const lang = useLang();
  const interactive = useInteractiveContext();
  const id = `control-${uniqueId}`;

  const contextValue: ControlContextType = {
    id,
    inputClassName: styles.input,
  };

  return (
    <ControlContext.Provider value={contextValue}>
      <div
        class={buildClassName(styles.control, props.inputEnd && styles.inputEnd, props.className)}
        dir={lang.isRtl ? 'rtl' : undefined}
      >
        <Show when={interactive?.isLoading}>
          <Spinner className={styles.spinner} />
        </Show>
        {props.children}
      </div>
    </ControlContext.Provider>
  );
};

// #endregion

// #region ControlLabel / ControlDescription

type ControlTextProps = {
  htmlFor?: string;
  className?: string;
  children: JSX.Element;
};

function ControlText(props: ControlTextProps & { baseClassName: string }) {
  const control = useControlContext();
  const interactive = useInteractiveContext();
  const resolvedHtmlFor = createMemo(() => props.htmlFor ?? control?.id);
  const shouldRenderLabel = createMemo(() => !interactive?.isLabel && resolvedHtmlFor());

  return (
    <Show
      when={shouldRenderLabel()}
      fallback={
        <span class={buildClassName(props.baseClassName, props.className)} dir="auto">
          {props.children}
        </span>
      }
    >
      <label for={resolvedHtmlFor()} class={buildClassName(props.baseClassName, props.className)} dir="auto">
        {props.children}
      </label>
    </Show>
  );
}

const ControlLabel = (props: ControlTextProps) => <ControlText {...props} baseClassName={styles.controlLabel} />;

const ControlDescription = (props: ControlTextProps) => (
  <ControlText {...props} baseClassName={styles.controlDescription} />
);

// #endregion

// #region ControlBefore / ControlAfter

type ControlSlotProps = {
  className?: string;
  children: JSX.Element;
};

type ControlIconProps = {
  iconName?: IconName;
  className?: string;
  backgroundColor?: string;
};

const ControlBefore = (props: ControlSlotProps) => {
  return <div class={buildClassName(styles.controlBefore, props.className)}>{props.children}</div>;
};

const ControlAfter = (props: ControlSlotProps) => {
  return <div class={buildClassName(styles.controlAfter, props.className)}>{props.children}</div>;
};

const ControlIcon = (props: ControlIconProps) => {
  return (
    <ControlBefore className={props.className}>
      <div
        class={buildClassName(styles.controlIcon, props.backgroundColor && styles.controlIconFilled)}
        style={props.backgroundColor ? `--control-icon-background-color: ${props.backgroundColor};` : undefined}
      >
        {props.iconName && <Icon name={props.iconName} className={styles.controlIconGlyph} />}
      </div>
    </ControlBefore>
  );
};

// #endregion

export default Control;
export { ControlLabel, ControlDescription, ControlBefore, ControlAfter, ControlIcon };
