import { createSignal } from 'frameact';
import { Show } from 'frameact/dom';

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

  const { result: highlighted } = useAsync(
    () => {
      const language = props.language;
      if (!language) return Promise.resolve(undefined);
      return import('../../../util/highlightCode').then((lib) => lib.default(props.text, language));
    },
    () => [props.language, props.text],
  );

  const handleWordWrapToggle = (wrap: boolean) => {
    setIsWordWrap(wrap);
  };

  return (
    <PeerColorWrapper className="CodeBlock">
      <Show when={props.language}>
        <p class="code-title">{getPrettyCodeLanguageName(props.language!)}</p>
      </Show>
      <pre
        class={buildClassName('code-block', !isWordWrap() && 'no-word-wrap custom-scroll-x no-scrollbar')}
        data-entity-type={ApiMessageEntityTypes.Pre}
        data-language={props.language}
      >
        {highlighted() ?? props.text}
        <CodeOverlay
          text={props.text}
          className="code-overlay"
          onWordWrapToggle={handleWordWrapToggle}
          noCopy={props.noCopy}
        />
      </pre>
    </PeerColorWrapper>
  );
};

export default CodeBlock;
