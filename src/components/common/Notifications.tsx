import { For, Show } from 'frameact/dom';
import { withGlobal } from '../../global';

import type { ApiNotification } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { selectTabState } from '../../global/selectors';
import { pick } from '../../util/iteratees';

import Notification from '../ui/Notification';

type StateProps = {
  notifications: ApiNotification[];
};

const Notifications = () => {
  const props = withGlobal({}, mapStateToProps);

  return (
    <Show when={props.notifications.length}>
      <div id="Notifications">
        <For each={props.notifications} keyed={(notification) => notification.localId}>
          {(notification) => <Notification notification={notification()} />}
        </For>
      </div>
    </Show>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => pick(selectTabState(global), ['notifications']);

export default Notifications;
