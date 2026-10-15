import { createMemo } from 'frameact';
import { lazy } from 'frameact/dom';

import type { OwnProps } from './MessageInput';

import { EDITABLE_INPUT_ID } from '../../../config';
import buildClassName from '../../../util/buildClassName';
import { Bundles, loadBundle } from '../../../util/moduleLoader';

const MessageInput = lazy<OwnProps>(() => loadBundle(Bundles.Editor).then((m) => ({ default: m.MessageInput })));

const MessageInputAsync = (props: OwnProps) => {
  if (MessageInput) {
    return <MessageInput {...props} />;
  }

  const placeholderId = createMemo(() => `${props.editableInputId || EDITABLE_INPUT_ID}-placeholder`);

  return (
    <div id={props.id} aria-busy>
      <div class="shared-canvas-container">
        <div class={buildClassName('custom-scroll', 'input-scroller', props.isNeedPremium && 'is-need-premium')}>
          <div class={buildClassName('input-scroller-content', props.isNeedPremium && 'is-need-premium')}>
            <div
              ref={props.ref}
              id={props.editableInputId || EDITABLE_INPUT_ID}
              class="form-control allow-selection focus-disabled"
              role="textbox"
              aria-disabled
              aria-labelledby={placeholderId()}
              tabIndex={-1}
            />
            {!props.forcedPlaceholder && (
              <span
                id={placeholderId()}
                class={buildClassName('placeholder-text', props.isNeedPremium && 'is-need-premium')}
                dir="auto"
              >
                {props.placeholder}
              </span>
            )}
          </div>
        </div>
      </div>
      {props.forcedPlaceholder && (
        <span id={placeholderId()} class="forced-placeholder">
          {props.forcedPlaceholder}
        </span>
      )}
    </div>
  );
};

export default MessageInputAsync;
