import type { ConnectionStatus } from '../../hooks/useConnectionStatus';

import useOldLang from '../../hooks/useOldLang';

import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import Transition from '../ui/Transition';

import './ConnectionStatusOverlay.scss';

type OwnProps = {
  connectionStatus: ConnectionStatus;
  connectionStatusText: string;
  onClick?: NoneToVoidFunction;
};

const ConnectionStatusOverlay = (props: OwnProps) => {
  const lang = useOldLang();

  return (
    <div id="ConnectionStatusOverlay" dir={lang.isRtl ? 'rtl' : undefined} onClick={() => props.onClick?.()}>
      <Spinner color="black" />
      <div class="state-text">
        <Transition activeKey={props.connectionStatus} name="slideFade">
          {(slide) => {
            // Deviation: each slide owns the text of its own key (the outgoing slide keeps its text while it slides out)
            const slideText = props.connectionStatusText;
            return <>{slide.isActive() ? props.connectionStatusText : slideText}</>;
          }}
        </Transition>
      </div>
      <Button round size="tiny" color="translucent-black" iconName="close" />
    </div>
  );
};

export default ConnectionStatusOverlay;
