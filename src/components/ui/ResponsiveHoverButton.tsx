import { splitProps } from 'frameact/dom';

import type { OwnProps as ButtonProps } from './Button';

import { IS_TOUCH_ENV } from '../../util/browser/windowEnvironment';

import Button from './Button';

type OwnProps = {
  onActivate: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  noClickActivation?: boolean;
  onMouseEnter?: NoneToVoidFunction;
  onMouseLeave?: NoneToVoidFunction;
} & Omit<ButtonProps, 'onClick' | 'onMouseDown' | 'onMouseEnter' | 'onMouseLeave' | 'onFocus'>;

const BUTTON_ACTIVATE_DELAY = 200;
let openTimeout: number | undefined;
let isFirstTimeActivation = true;

const ResponsiveHoverButton = (props: OwnProps) => {
  const [, buttonProps] = splitProps(props, ['onActivate', 'noClickActivation', 'onMouseEnter', 'onMouseLeave']);
  let isMouseInsideRef = false;

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    isMouseInsideRef = true;
    props.onMouseEnter?.();

    // This is used to counter additional delay caused by asynchronous module loading
    if (isFirstTimeActivation) {
      isFirstTimeActivation = false;
      props.onActivate(e);
      return;
    }

    if (openTimeout) {
      clearTimeout(openTimeout);
      openTimeout = undefined;
    }
    openTimeout = window.setTimeout(() => {
      if (isMouseInsideRef) {
        props.onActivate(e);
      }
    }, BUTTON_ACTIVATE_DELAY);
  };

  const handleMouseLeave = () => {
    isMouseInsideRef = false;
    props.onMouseLeave?.();
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    isMouseInsideRef = true;
    props.onActivate(e);
  };

  return (
    <Button
      {...buttonProps}
      onMouseEnter={!IS_TOUCH_ENV ? handleMouseEnter : undefined}
      onMouseLeave={!IS_TOUCH_ENV ? handleMouseLeave : undefined}
      onClick={!IS_TOUCH_ENV ? (props.noClickActivation ? undefined : props.onActivate) : handleClick}
    />
  );
};

export default ResponsiveHoverButton;
