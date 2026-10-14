import { mergeProps } from 'frameact/dom';

import buildClassName from '../../util/buildClassName';

import Spinner from './Spinner';

import './Loading.scss';

type OwnProps = {
  color?: 'blue' | 'white' | 'black' | 'yellow';
  backgroundColor?: 'light' | 'dark';
  className?: string;
  onClick?: NoneToVoidFunction;
};

const Loading = (rawProps: OwnProps) => {
  const props = mergeProps({ color: 'blue' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'color'>>;
  return (
    <div class={buildClassName('Loading', props.onClick && 'interactive', props.className)} onClick={props.onClick}>
      <Spinner color={props.color} backgroundColor={props.backgroundColor} />
    </div>
  );
};

export default Loading;
