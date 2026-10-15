
import buildClassName from '../../util/buildClassName';
import renderText from './helpers/renderText';

import useLang from '../../hooks/useLang';

import './DotAnimation.scss';

type OwnProps = {
  content: string;
  className?: string;
};

const DotAnimation = (props: OwnProps) => {
  const lang = useLang();
  return (
    <span class={buildClassName('DotAnimation', props.className)} dir={lang.isRtl ? 'rtl' : 'auto'}>
      {renderText(props.content)}
      <span class="ellipsis" />
    </span>
  );
};

export default DotAnimation;
