import type { ApiUser } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';
import renderText from '../../common/helpers/renderText';

import useLang from '../../../hooks/useLang';

import Avatar from '../../common/Avatar';
import Icon from '../../common/icons/Icon';
import ListItem from '../../ui/ListItem';

import './ChatCommand.scss';

type OwnProps<T = undefined> = {
  command: string;
  description: string;
  peer?: ApiUser;
  withAvatar?: boolean;
  focus?: boolean;
  isEphemeral?: true;
  clickArg: T;
  onClick: (arg: T) => void;
};

const ChatCommand = <T,>(props: OwnProps<T>) => {
  const lang = useLang();

  const handleClick = () => {
    props.onClick(props.clickArg);
  };

  // Deviation: tt's `key={command}` on the ListItem remounted it when the command changed. The rows of the tooltip are
  // keyed by command already (bot commands) or by quick reply id (a renamed shortcut updates the row in place).
  return (
    <ListItem
      className={buildClassName('BotCommand chat-item-clickable scroll-item', props.withAvatar && 'with-avatar')}
      multiline
      onClick={handleClick}
      focus={props.focus}
    >
      {props.withAvatar && <Avatar size="small" peer={props.peer} />}
      <div class="content-inner">
        <span class="title">
          /{props.command}
          {props.isEphemeral && (
            <Icon name="eye" className="ephemeral-icon in-text-icon" ariaLabel={lang('EphemeralOnlyVisible')} />
          )}
        </span>
        <span class="subtitle">{renderText(props.description)}</span>
      </div>
    </ListItem>
  );
};

export default ChatCommand;
