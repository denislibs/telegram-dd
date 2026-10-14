import renderText from '../common/helpers/renderText';

import useHistoryBack from '../../hooks/useHistoryBack';
import useLang from '../../hooks/useLang';

import Button from '../ui/Button';

import './AppInactive.scss';

import appInactivePath from '../../assets/app-inactive.png';

type OwnProps = {
  inactiveReason: 'auth' | 'otherClient';
};

const AppInactive = (props: OwnProps) => {
  const lang = useLang();

  const handleReload = () => {
    window.location.reload();
  };

  useHistoryBack({
    isActive: true,
    onBack: handleReload,
    shouldResetUrlHash: true,
  });

  return (
    <div id="AppInactive">
      <div class="content">
        <img src={appInactivePath} alt="" />
        <h3 class="title">
          {props.inactiveReason === 'auth' ? lang('AppInactiveAuthTitle') : lang('AppInactiveOtherClientTitle')}
        </h3>
        <div class="description">
          {renderText(
            lang(props.inactiveReason === 'auth' ? 'AppInactiveAuthDescription' : 'AppInactiveOtherClientDescription'),
            ['br'],
          )}
        </div>
        <div class="actions">
          <Button isText ripple onClick={handleReload}>
            {lang('AppInactiveReload')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AppInactive;
