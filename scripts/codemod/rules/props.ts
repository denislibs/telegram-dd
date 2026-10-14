// Props are getters in frameact. `({ a, b = 1, ...rest }: P) =>` becomes `(props: P) =>` (or `(rawProps: P)` plus a
// `mergeProps` line for defaults, `splitProps` for the rest) and every read `a` becomes `props.a` (scope-aware).
// A body-level `const { a } = props` is folded the same way. A connected component (`withGlobal`) gets its state props
// merged in through the placeholder contract of the withGlobal rule (`mapStateToProps` + `createMemo` + `mergeProps`).
import type { Binding, NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

import { findBodies, referencesOf, type RunOnceBody } from '../analysis.ts';
import { MAP_STATE_NAME, MAPPER_PLACEMENT } from './withGlobal.ts';

interface Entry {
  key: string;
  local: string;
  binding: Binding | undefined;
  default?: t.Expression;
  /** The range of the pattern this entry came from (its own references are not rewritten). */
  patternRange: [number, number];
}

interface Collected {
  entries: Entry[];
  rest?: { name: string; binding: Binding | undefined };
  bail?: string;
}

function collectPattern(ctx: Ctx, pattern: t.ObjectPattern, scope: NodePath['scope']): Collected {
  const entries: Entry[] = [];
  let rest: Collected['rest'];
  const patternRange: [number, number] = [pattern.start!, pattern.end!];
  for (const property of pattern.properties) {
    if (property.type === 'RestElement') {
      if (property.argument.type !== 'Identifier') return { entries, bail: 'rest element is not an identifier' };
      rest = { name: property.argument.name, binding: scope.getBinding(property.argument.name) };
      continue;
    }
    if (property.computed || property.key.type !== 'Identifier') return { entries, bail: 'computed key' };
    const key = property.key.name;
    let value = property.value;
    let def: t.Expression | undefined;
    if (value.type === 'AssignmentPattern') {
      def = value.right;
      value = value.left;
    }
    if (value.type !== 'Identifier') return { entries, bail: `nested pattern for "${key}"` };
    entries.push({ key, local: value.name, binding: scope.getBinding(value.name), default: def, patternRange });
  }
  return { entries, rest };
}

/** Does the default expression only read module-level things (constants, literals)? */
function isConstantDefault(ctx: Ctx, expr: t.Expression, fnScope: NodePath['scope']): boolean {
  if (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') return true;
  let constant = true;
  const check = (node: t.Node) => {
    if (!constant) return;
    if (node.type === 'Identifier') {
      const binding = fnScope.getBinding(node.name);
      if (binding && binding.scope !== fnScope.getProgramParent()) constant = false;
      return;
    }
    if (node.type === 'ThisExpression' || node.type === 'CallExpression' || node.type === 'NewExpression') {
      constant = false;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof (c as t.Node).type === 'string' && check(c as t.Node));
      else if (child && typeof (child as t.Node).type === 'string') {
        // a MemberExpression property identifier is not a reference
        if (node.type === 'MemberExpression' && key === 'property' && !node.computed) continue;
        check(child as t.Node);
      }
    }
  };
  check(expr);
  return constant;
}

/** The text of `expr` with reads of the destructured locals replaced by `props.<key>`. */
function defaultText(ctx: Ctx, expr: t.Expression, entries: Entry[]): string {
  const start = expr.start!;
  let text = ctx.text(expr);
  const replacements: { from: number; to: number; text: string }[] = [];
  for (const entry of entries) {
    if (!entry.binding) continue;
    for (const ref of referencesOf(entry.binding)) {
      if (ref.node.start! >= start && ref.node.end! <= expr.end!) {
        replacements.push({ from: ref.node.start! - start, to: ref.node.end! - start, text: `props.${entry.key}` });
      }
    }
  }
  replacements.sort((a, b) => b.from - a.from);
  for (const r of replacements) text = text.slice(0, r.from) + r.text + text.slice(r.to);
  return text;
}

function firstIntersectionMember(typeText: string): string {
  return typeText.split('&')[0].trim();
}

function rewriteBody(ctx: Ctx, body: RunOnceBody): void {
  const fn = body.fn;
  const param = fn.node.params[0];
  const connected = body.connected;
  if (!param && !connected) return;
  let typeText: string | undefined;
  let paramName: string | undefined;
  const removals: t.Node[] = [];
  const collected: Collected[] = [];

  if (param) {
    const annotation = (param as t.Identifier | t.ObjectPattern | t.AssignmentPattern).typeAnnotation;
    if (annotation?.type === 'TSTypeAnnotation') typeText = ctx.text(annotation.typeAnnotation);
    if (param.type === 'ObjectPattern') {
      const c = collectPattern(ctx, param, fn.scope);
      if (c.bail) {
        ctx.todo(param, 'props-pattern', `props pattern not rewritten: ${c.bail}`);
        return;
      }
      collected.push(c);
    } else if (param.type === 'Identifier') {
      paramName = param.name;
      // body-level `const { a, b } = props;`
      for (const statement of body.body?.get('body') ?? []) {
        if (!statement.isVariableDeclaration()) continue;
        for (const declarator of statement.node.declarations) {
          if (
            declarator.id.type === 'ObjectPattern' &&
            declarator.init?.type === 'Identifier' &&
            declarator.init.name === paramName &&
            statement.node.declarations.length === 1
          ) {
            const c = collectPattern(ctx, declarator.id, fn.scope);
            if (c.bail) {
              ctx.todo(statement.node, 'props-pattern', `props pattern not rewritten: ${c.bail}`);
              continue;
            }
            collected.push(c);
            removals.push(statement.node);
          }
        }
      }
    } else {
      ctx.todo(param, 'props-pattern', 'unsupported props parameter shape');
      return;
    }
  }

  const entries = collected.flatMap((c) => c.entries);
  const rests = collected.map((c) => c.rest).filter(Boolean) as NonNullable<Collected['rest']>[];
  const defaults = entries.filter((entry) => entry.default);
  const needsMerge = defaults.length > 0 || Boolean(connected);
  if (entries.length === 0 && rests.length === 0 && !needsMerge) return;

  // `props` unless the body already declares one (`const props = useMemo(…)` in tt's Reactions).
  const paramBinding = param?.type === 'Identifier' ? fn.scope.getOwnBinding(param.name) : undefined;
  const taken = (name: string) => {
    const binding = fn.scope.getOwnBinding(name);
    return Boolean(binding && binding !== paramBinding);
  };
  const propsName = taken('props') ? 'componentProps' : 'props';
  let rawName = paramName ?? propsName;
  if (needsMerge) rawName = connected ? 'ownProps' : 'rawProps';
  if (!needsMerge && paramName === undefined) rawName = propsName;
  if (paramName && paramName !== propsName && !needsMerge) {
    // `(p: Props)` with `const { a } = p` in the body: keep the author's name.
    rawName = paramName;
  }
  // `({ isOpen, ...props })`: the rest keeps the author's name, the full bag becomes `allProps`.
  if (rests.some((rest) => rest.name === rawName)) rawName = 'allProps';
  const mergedName = needsMerge ? propsName : rawName;

  // 1. The parameter. A connected component without own props (`(props: StateProps)`) takes none.
  let ownType = typeText;
  let hasOwnProps = true;
  if (connected) {
    ownType = connected.ownPropsType ?? (typeText ? firstIntersectionMember(typeText) : undefined);
    const mapArity = connected.mapFn ? connected.mapFn.node.params.length : 2;
    if (!connected.ownPropsType && mapArity <= 1 && (!ownType || /StateProps$/.test(ownType))) hasOwnProps = false;
  }
  if (!hasOwnProps) {
    if (param) ctx.overwrite(param, '');
  } else if (param) {
    ctx.overwrite(param, `${rawName}${ownType ? `: ${ownType}` : ''}`);
  } else {
    ctx.insertAfter(fnParamsEnd(ctx, fn.node), `${rawName}${ownType ? `: ${ownType}` : ''}`);
  }
  if (param?.type === 'ObjectPattern') ctx.hit('propsParam');

  // 2. The merge line(s) at the top of the body.
  const lines: string[] = [];
  if (needsMerge) {
    const sources: string[] = [];
    if (defaults.length) {
      const fields = defaults.map((entry) => {
        if (isConstantDefault(ctx, entry.default!, fn.scope)) return `${entry.key}: ${ctx.text(entry.default!)}`;
        return `get ${entry.key}() { return ${defaultText(ctx, entry.default!, entries)}; }`;
      });
      sources.push(`{ ${fields.join(', ')} }`);
    }
    if (connected) {
      // store contract §12.2: `withGlobal(ownProps, MAPPER, ACTIVATION?)`, mapper and activation verbatim
      const mapperText =
        (MAPPER_PLACEMENT as string) === 'module' && connected.mapFn
          ? MAP_STATE_NAME
          : (connected.mapRef ?? (connected.mapFn ? ctx.text(connected.mapFn.node) : '() => ({})'));
      const activation = connected.activationFn ? `, ${ctx.text(connected.activationFn.node)}` : '';
      sources.push(`withGlobal(${hasOwnProps ? rawName : '{}'}, ${mapperText}${activation})`);
      ctx.hit('connectedProps');
    } else if (hasOwnProps) {
      sources.push(rawName);
    }
    let mergedType = typeText;
    if (defaults.length && typeText) {
      const keys = defaults.map((entry) => `'${entry.key}'`).join(' | ');
      mergedType = `${typeText} & Required<Pick<${typeText}, ${keys}>>`;
      ctx.hit('propsDefaults');
    }
    if (sources.length === 1 && connected) {
      lines.push(`const ${propsName} = ${sources[0]};`);
    } else {
      lines.push(`const ${propsName} = mergeProps(${sources.join(', ')})${mergedType ? ` as ${mergedType}` : ''};`);
    }
  }
  for (const rest of rests) {
    const keys = entries.map((entry) => `'${entry.key}'`).join(', ');
    lines.push(`const [, ${rest.name}] = splitProps(${mergedName}, [${keys}]);`);
    ctx.hit('propsRest');
  }
  if (lines.length && body.body) {
    const block = body.body.node;
    const first = block.body[0];
    const indent = first ? ctx.indentOf(first) : `${ctx.indentOf(fn.node)}  `;
    ctx.insertAfter(block.start! + 1, `\n${lines.map((line) => indent + line).join('\n')}`);
  } else if (lines.length) {
    // `=> <div/>`: the body becomes a block that holds the merge line
    const expr = fn.node.body as t.Expression;
    const outer = ctx.indentOf(fn.node);
    const indent = `${outer}  `;
    const [start, end] = ctx.rangeWithParens(expr);
    ctx.insertBefore(start, `{\n${lines.map((line) => indent + line).join('\n')}\n${indent}return `);
    ctx.insertAfter(end, `;\n${outer}}`);
  }

  // 3. Remove the body destructuring statements.
  for (const node of removals) ctx.removeStatement(node);

  // 4. Reads.
  let reads = 0;
  for (const entry of entries) {
    if (!entry.binding) continue;
    for (const ref of referencesOf(entry.binding)) {
      const pos = ref.node.start!;
      if (pos >= entry.patternRange[0] && pos < entry.patternRange[1]) continue;
      const parent = ref.parentPath;
      if (parent.isTSTypeQuery()) continue;
      const replacement = `${mergedName}.${entry.key}`;
      if (parent.isObjectProperty({ value: ref.node }) && parent.node.shorthand) {
        ctx.overwrite(parent.node, `${entry.key === entry.local ? entry.key : entry.local}: ${replacement}`);
      } else {
        ctx.overwrite(ref.node, replacement);
      }
      reads++;
    }
    for (const violation of entry.binding.constantViolations) {
      ctx.todo(
        violation.node,
        'props-assign',
        `"${entry.local}" was a destructured prop and is assigned here: props are read-only getters`,
      );
    }
  }
  if (reads) ctx.hit('propsReads', reads);
}

function fnParamsEnd(ctx: Ctx, fn: t.Function): number {
  // position of the closing paren of an empty parameter list
  const open = ctx.code.indexOf('(', fn.start!);
  return ctx.code.indexOf(')', open);
}

export const propsRule: Rule = {
  name: 'props',
  description:
    'destructured props → `props` getters (+ mergeProps for defaults, splitProps for rest, state props merge)',
  run(ctx: Ctx) {
    for (const body of findBodies(ctx)) {
      if (body.kind !== 'component') continue;
      rewriteBody(ctx, body);
    }
  },
};
