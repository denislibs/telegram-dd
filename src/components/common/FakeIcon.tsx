import type { ApiFakeType } from '../../api/types';

import useLang from '../../hooks/useLang';

import './FakeIcon.scss';

type OwnProps = {
  fakeType: ApiFakeType;
};

const FakeIcon = (props: OwnProps) => {
  const lang = useLang();

  return <span class="FakeIcon">{lang(props.fakeType === 'fake' ? 'FakeMessage' : 'ScamMessage')}</span>;
};

export default FakeIcon;
