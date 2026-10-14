import { mergeProps } from 'frameact/dom';

import buildClassName from '../../util/buildClassName';

import styles from './Spinner.module.scss';

type OwnProps = {
  color?: 'blue' | 'white' | 'black' | 'green' | 'gray' | 'yellow';
  backgroundColor?: 'light' | 'dark';
  className?: string;
};

const Spinner = (rawProps: OwnProps) => {
  const props = mergeProps({ color: 'blue' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'color'>>;
  return (
    <div
      class={buildClassName(
        'Spinner',
        styles.root,
        props.color && styles[props.color],
        props.backgroundColor && styles.withBackground,
        props.backgroundColor && styles[`${props.backgroundColor}Bg`],
        props.className,
      )}
    >
      <div class={buildClassName('Spinner__inner', styles.inner)} />
    </div>
  );
};

export default Spinner;
