import { lazy, Show } from 'frameact/dom';

import type { OwnProps } from './MessageInput';

import { EDITABLE_INPUT_ID } from '../../../config';
import buildClassName from '../../../util/buildClassName';
import { Bundles, loadBundle } from '../../../util/moduleLoader';

const MessageInputAsync = (props: OwnProps) => {
  const placeholderId = () => `${props.editableInputId || EDITABLE_INPUT_ID}-placeholder`;

  // Deviation: the placeholder needs the props of this instance, so the `lazy` wrapper is created here (the bundle
  // itself is loaded and cached once by `loadBundle`).
  const MessageInput = lazy<OwnProps>(() => loadBundle(Bundles.Editor).then((m) => ({ default: m.MessageInput })), {
    placeholder: () => (
      <div id={props.id} aria-busy="true">
        <div class="shared-canvas-container">
          <div class={buildClassName('custom-scroll', 'input-scroller', props.isNeedPremium && 'is-need-premium')}>
            <div class={buildClassName('input-scroller-content', props.isNeedPremium && 'is-need-premium')}>
              <div
                ref={(el) => props.ref?.(el)}
                id={props.editableInputId || EDITABLE_INPUT_ID}
                class="form-control allow-selection focus-disabled"
                role="textbox"
                aria-disabled="true"
                aria-labelledby={placeholderId()}
                tabIndex={-1}
              />
              <Show when={!props.forcedPlaceholder}>
                <span
                  id={placeholderId()}
                  class={buildClassName('placeholder-text', props.isNeedPremium && 'is-need-premium')}
                  dir="auto"
                >
                  {props.placeholder}
                </span>
              </Show>
            </div>
          </div>
        </div>
        <Show when={props.forcedPlaceholder}>
          <span id={placeholderId()} class="forced-placeholder">
            {props.forcedPlaceholder}
          </span>
        </Show>
      </div>
    ),
  });

  return <MessageInput {...props} />;
};

export default MessageInputAsync;
