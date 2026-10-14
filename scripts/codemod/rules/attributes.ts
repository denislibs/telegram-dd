// React/teact spell a few DOM attributes camelCase; frameact's JSX types (and the DOM runtime) take the HTML attribute
// name. Only names that frameact's `jsx.d.ts` does not declare in camelCase are renamed, on intrinsic elements.
import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

const RENAMES: Record<string, string> = {
  autoComplete: 'autocomplete',
  autoPlay: 'autoplay',
  autoFocus: 'autofocus',
  autoCorrect: 'autocorrect',
  playsInline: 'playsinline',
  spellCheck: 'spellcheck',
  enterKeyHint: 'enterkeyhint',
  disablePictureInPicture: 'disablepictureinpicture',
};

export const attributesRule: Rule = {
  name: 'attributes',
  description: 'autoComplete / autoPlay / autoFocus / spellCheck / playsInline … → the HTML attribute name on elements',
  run(ctx: Ctx) {
    ctx.program.traverse({
      JSXAttribute(path) {
        const parent = path.parentPath.node;
        if (parent.type !== 'JSXOpeningElement') return;
        const tag = parent.name;
        if (tag.type !== 'JSXIdentifier' || !/^[a-z]/.test(tag.name)) return;
        const name = path.node.name;
        if (name.type !== 'JSXIdentifier') return;
        const renamed = RENAMES[name.name];
        if (!renamed) return;
        ctx.overwrite(name, renamed);
        ctx.hit('attributeName');
      },
    });
  },
};
