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

  return (
    // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{(key) => …}</Show> (the callback MUST take an argument, a zero-argument child is a plain child and never remounts; a falsy key such as 0 renders nothing: use when={{ id: key }})
    <ListItem
      key={props.command}
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
