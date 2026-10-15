import { getActions, withGlobal } from '../../global';
import type { GlobalState } from '../../global/types';

import { getUserFirstOrLastName } from '../../global/helpers';
import { selectUser } from '../../global/selectors';

import useOldLang from '../../hooks/useOldLang';

import Link from '../ui/Link';

type OwnProps = {
  userId: string;
};

type StateProps = {
  userName?: string;
};

function PremiumRequiredPlaceholder(ownProps: OwnProps) {
  const props = withGlobal(ownProps, mapStateToProps);
  const lang = useOldLang();
  const { openPremiumModal } = getActions();

  const handleOpenPremiumModal = () => openPremiumModal();

  return (
    <div>
      <div>{lang('Chat.MessagingRestrictedPlaceholder', props.userName)}</div>
      <Link isPrimary onClick={handleOpenPremiumModal}>
        {lang('Chat.MessagingRestrictedPlaceholderAction')}
      </Link>
    </div>
  );
}

const mapStateToProps = (global: GlobalState, { userId }: OwnProps): Complete<StateProps> => {
    const user = selectUser(global, userId);

    return {
      userName: getUserFirstOrLastName(user),
    };
  };

export default PremiumRequiredPlaceholder;
