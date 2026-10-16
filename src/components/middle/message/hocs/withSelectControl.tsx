import { splitProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions, withGlobal } from '../../../../global';

import type { GlobalState } from '../../../../global/types';
import type { OwnProps as PhotoProps } from '../Photo';
import type { OwnProps as VideoProps } from '../Video';

import { selectIsInSelectMode, selectIsMessageSelected } from '../../../../global/selectors';
import buildClassName from '../../../../util/buildClassName';

import Icon from '../../../common/icons/Icon';

type OwnProps<T> = (PhotoProps<T> | VideoProps<T>) & {
  clickArg: number;
  noSelectControls?: boolean;
};

type StateProps = {
  isInSelectMode?: boolean;
  isSelected?: boolean;
};

// Deviation: tt's HOC is a wrapper component here (docs/porting-guide.md §4.2). `withSelectControl(Photo)` keeps its call
// shape; the wrapper passes the props of the wrapped component through as lazy getters (`splitProps`), with the selection
// state and the click handler overridden by getters, since they change when the selection mode is toggled.
export default function withSelectControl(WrappedComponent: (props: never) => JSX.Element) {
  const ComponentWithSelectControl = <T,>(ownProps: OwnProps<T>) => {
    const props = withGlobal(ownProps, mapStateToProps);
    const { toggleMessageSelection } = getActions();
    const Wrapped = WrappedComponent as unknown as (props: PhotoProps<T> | VideoProps<T>) => JSX.Element;

    // The wrapped component gets everything but the select props; its `onClick` is set below (a spread `onClick` would
    // win over a getter that returns `undefined`).
    const [, rest] = splitProps(ownProps, ['onClick', 'noSelectControls']);

    const handleMessageSelect = (e: MouseEvent) => {
      e.stopPropagation();
      toggleMessageSelection({ messageId: props.clickArg, withShift: e?.shiftKey });
    };

    return (
      <div
        class={buildClassName('album-item-select-wrapper', props.isSelected && 'is-selected')}
        onClick={(e) => {
          if (props.isInSelectMode) handleMessageSelect(e);
        }}
      >
        {props.isInSelectMode && (
          <div class="message-select-control">
            {props.isSelected && <Icon name="check" className="message-select-control-icon" />}
          </div>
        )}
        <Wrapped
          {...(rest as PhotoProps<T> | VideoProps<T>)}
          isInSelectMode={props.isInSelectMode}
          isSelected={props.isSelected}
          onClick={props.isInSelectMode ? undefined : ownProps.onClick}
        />
      </div>
    );
  };

  return ComponentWithSelectControl;
}

const mapStateToProps = (
  global: GlobalState,
  ownProps: Pick<OwnProps<unknown>, 'clickArg' | 'noSelectControls'>,
): StateProps => {
  const { clickArg, noSelectControls } = ownProps;
  return {
    isInSelectMode: !noSelectControls && selectIsInSelectMode(global),
    isSelected: !noSelectControls && selectIsMessageSelected(global, clickArg),
  };
};
