import { createMemo, createSignal } from 'frameact';

import { ApiMessageEntityTypes } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';
import { getPrettyCodeLanguageName } from '../../../util/codeLanguages';

import useAsync from '../../../hooks/useAsync';

import PeerColorWrapper from '../PeerColorWrapper';
import CodeOverlay from './CodeOverlay';

import './CodeBlock.scss';

export type OwnProps = {
  text: string;
  language?: string;
  noCopy?: boolean;
};

const CodeBlock = (props: OwnProps) => {
  const [isWordWrap, setIsWordWrap] = createSignal(true);

  const asyncResult = createMemo(() => useAsync(() => {
    if (!props.language) return Promise.resolve(undefined);
    return import('../../../util/highlightCode').then((lib) => lib.default(props.text, props.language));
  }, () => [props.language, props.text]));
  const highlighted = () => asyncResult().result;

  const handleWordWrapToggle = (wrap) => {
    setIsWordWrap(wrap);
  };

  const blockClass = createMemo(() => buildClassName('code-block', !isWordWrap() && 'no-word-wrap custom-scroll-x no-scrollbar'));

  return (
    <PeerColorWrapper className="CodeBlock">
      {props.language && <p class="code-title">{getPrettyCodeLanguageName(props.language)}</p>}
      <pre class={blockClass()} data-entity-type={ApiMessageEntityTypes.Pre} data-language={props.language}>
        {highlighted() ?? props.text}
        <CodeOverlay text={props.text} className="code-overlay" onWordWrapToggle={handleWordWrapToggle} noCopy={props.noCopy} />
      </pre>
    </PeerColorWrapper>
  );
};

export default CodeBlock;
