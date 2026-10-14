import { mergeProps } from 'frameact/dom';

import buildClassName from '../../util/buildClassName';

import styles from './MenuSeparator.module.scss';

type OwnProps = {
  className?: string;
  size?: 'thin' | 'thick';
};

const MenuSeparator = (rawProps: OwnProps) => {
  const props = mergeProps({ size: 'thin' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'size'>>;
  return <div class={buildClassName(styles.root, styles[props.size], props.className)} />;
};

export default MenuSeparator;
