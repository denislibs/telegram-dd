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
    <div id="ConnectionStatusOverlay" dir={lang.isRtl ? 'rtl' : undefined} onClick={(e) => props.onClick?.(e)}>
      <Spinner color="black" />
      <div class="state-text">
        {/* TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6) */}
        <Transition activeKey={props.connectionStatus} name="slideFade">
          {props.connectionStatusText}
        </Transition>
      </div>
      <Button round size="tiny" color="translucent-black" iconName="close" />
    </div>
  );
};

export default ConnectionStatusOverlay;
