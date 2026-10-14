// teact delegates `onChange` of every element but `<select>` to the `input` event (React semantics: it fires per
// keystroke); frameact's `onChange` is the native `change` event (on blur / Enter for text fields). So `onChange` on an
// intrinsic non-select element becomes `onInput`.
import type * as t from '@babel/types';

import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

export const inputEventsRule: Rule = {
  name: 'inputEvents',
  description: 'onChange on an intrinsic non-select element → onInput (teact fires it per keystroke)',
  run(ctx: Ctx) {
    ctx.program.traverse({
      JSXOpeningElement(path) {
        const name = path.node.name;
        if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name) || name.name === 'select') return;
        const attrs = path.node.attributes;
        const onChange = attrs.find(
          (a): a is t.JSXAttribute =>
            a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'onChange',
        );
        if (!onChange) return;
        const hasOnInput = attrs.some(
          (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'onInput',
        );
        if (hasOnInput) {
          ctx.todo(path.node, 'on-change', 'both onChange and onInput: teact fired both on input; merge the handlers');
          return;
        }
        ctx.overwrite(onChange.name, 'onInput');
        ctx.hit('onChangeToInput');
      },
    });
  },
};
