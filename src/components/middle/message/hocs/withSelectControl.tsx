import type { MouseEvent as ReactMouseEvent } from 'react';
import { createMemo } from 'frameact';
import { getActions } from '../../../../global';
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

export default function withSelectControl(WrappedComponent: FC) {
  const ComponentWithSelectControl = <T,>(props: OwnProps<T> & StateProps) => {
    const { isInSelectMode, isSelected, clickArg } = props;
    const { toggleMessageSelection } = getActions();

    const handleMessageSelect = (e: ReactMouseEvent<HTMLDivElement, MouseEvent>) => {
      e.stopPropagation();
      toggleMessageSelection({ messageId: clickArg, withShift: e?.shiftKey });
    };

    const newProps = createMemo(() => {
      const { onClick } = props;
      return {
        ...props,
        isInSelectMode,
        isSelected,
        onClick: isInSelectMode ? undefined : onClick,
      };
    });

    return (
      <div
        class={buildClassName('album-item-select-wrapper', isSelected && 'is-selected')}
        onClick={isInSelectMode ? handleMessageSelect : undefined}
      >
        {isInSelectMode && (
          <div class="message-select-control">
            {isSelected && <Icon name="check" className="message-select-control-icon" />}
          </div>
        )}
        <WrappedComponent {...newProps} />
      </div>
    );
  };

  const mapStateToProps = (global: GlobalState, ownProps: OwnProps<unknown>) => {
      const { clickArg, noSelectControls } = ownProps;
      return {
        isInSelectMode: !noSelectControls && selectIsInSelectMode(global),
        isSelected: !noSelectControls && selectIsMessageSelected(global, clickArg),
      };
    };

return ComponentWithSelectControl as typeof ComponentWithSelectControl;
}
