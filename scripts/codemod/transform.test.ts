import { describe, expect, it } from 'vitest';

import { transformSource } from './transform.ts';

const FILE = 'src/components/ui/Example.tsx';
const run = (code: string, only?: string[]) => transformSource(code, { filePath: FILE, only });
const squash = (code: string) => code.replace(/\s+/g, ' ').trim();
const expectIncludes = (code: string, snippet: string) => expect(squash(code)).toContain(squash(snippet));

describe('types', () => {
  it('drops memo(), moves FC<P> onto the parameter, maps TeactNode and ElementRef', () => {
    const { code, report } = run(
      `import type { FC, TeactNode, ElementRef } from '../../lib/teact/teact';
import { memo } from '../../lib/teact/teact';
type OwnProps = { children?: TeactNode; ref?: ElementRef<HTMLDivElement> };
const X: FC<OwnProps> = (props) => <div>{props.children}</div>;
export default memo(X);`,
      ['types', 'imports'],
    );
    expectIncludes(code, 'children?: JSX.Element; ref?: (el: HTMLDivElement) => void');
    expectIncludes(code, 'const X = (props: OwnProps) =>');
    expectIncludes(code, 'export default X;');
    expectIncludes(code, "import type { JSX } from 'frameact/jsx-runtime';");
    expect(code).not.toContain('lib/teact');
    expect(report.hits).toMatchObject({ memo: 1, fc: 1, teactNode: 1, elementRefType: 1 });
    expect(report.todos).toEqual([]);
  });
});

describe('props', () => {
  it('rewrites a destructured parameter to props getters, scope-aware', () => {
    const { code } = run(
      `type OwnProps = { a: string; b?: number; onClick?: () => void };
const X = ({ a, b, onClick }: OwnProps) => {
  const inner = (a: string) => a.length; // shadowed
  const handle = () => onClick?.();
  return <div title={a} data-b={b} onClick={handle}>{inner(a)} {JSON.stringify({ a })}</div>;
};`,
      ['props'],
    );
    expectIncludes(code, 'const X = (props: OwnProps) => {');
    expectIncludes(code, 'const inner = (a: string) => a.length;');
    expectIncludes(code, 'props.onClick?.()');
    expectIncludes(code, 'title={props.a} data-b={props.b}');
    expectIncludes(code, 'JSON.stringify({ a: props.a })');
  });

  it('turns defaults into mergeProps (getters for defaults that read other props) and rest into splitProps', () => {
    const { code } = run(
      `type OwnProps = { size?: 'a' | 'b'; color?: string; fast?: boolean; id?: string };
const X = ({ size = 'a', color = 'red', fast = color === 'blue', ...rest }: OwnProps) => <div id={rest.id} class={size + color} />;
const Y = ({ size = 'a' }: OwnProps) => {
  return <div class={size} />;
};`,
      ['props'],
    );
    expectIncludes(code, 'const Y = (rawProps: OwnProps) => {');
    expectIncludes(
      code,
      "const props = mergeProps({ size: 'a' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'size'>>;",
    );
    expectIncludes(code, 'return <div class={props.size} />;');
    // an expression-bodied component gets a block for the merge line
    expectIncludes(
      code,
      "const X = (rawProps: OwnProps) => { const props = mergeProps({ size: 'a', color: 'red', get fast() { return props.color === 'blue'; } }, rawProps) as OwnProps & Required<Pick<OwnProps, 'size' | 'color' | 'fast'>>; const [, rest] = splitProps(props, ['size', 'color', 'fast']); return <div id={rest.id} class={props.size + props.color} />; };",
    );
  });

  it('folds a body-level `const { a } = props` and keeps the author’s parameter name', () => {
    const { code } = run(
      `const X = (props: OwnProps) => {
  const { isOpen, title: heading = 'x' } = props;
  return <div hidden={!isOpen}>{heading}</div>;
};`,
      ['props'],
    );
    expectIncludes(code, 'const X = (rawProps: OwnProps) => {');
    expectIncludes(code, "const props = mergeProps({ title: 'x' }, rawProps)");
    expectIncludes(code, '<div hidden={!props.isOpen}>{props.title}</div>');
    expect(code).not.toContain('= props;');
  });
});

describe('withGlobal (store contract §12.2)', () => {
  it('keeps the mapper at module level, calls withGlobal(ownProps, mapStateToProps) in the body, exports the plain component', () => {
    const { code, report } = run(
      `import { memo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';
type OwnProps = { userId: string };
type StateProps = { userName?: string };
function X({ userName }: OwnProps & StateProps) {
  const { openPremiumModal } = getActions();
  return <div onClick={() => openPremiumModal()}>{userName}</div>;
}
export default memo(withGlobal<OwnProps>(
  (global, { userId }): Complete<StateProps> => {
    return { userName: selectUser(global, userId)?.firstName };
  },
)(X));`,
    );
    expectIncludes(code, 'function X(ownProps: OwnProps) {');
    expectIncludes(code, 'const props = withGlobal(ownProps, mapStateToProps);');
    expectIncludes(
      code,
      'const mapStateToProps = (global: GlobalState, { userId }: OwnProps): Complete<StateProps> => { return { userName: selectUser(global, userId)?.firstName }; };',
    );
    expectIncludes(code, "import type { GlobalState } from '../../global/types';");
    expect(code).not.toContain('withGlobal<');
    expectIncludes(code, '{props.userName}');
    expectIncludes(code, 'export default X;');
    expectIncludes(code, "import { getActions, withGlobal } from '../../global';");
    expect(code).not.toContain('memo(');
    expect(report.hits).toMatchObject({ withGlobal: 1, connectedProps: 1 });
    expect(report.todos).toEqual([]);
  });

  it('passes the activation function through, merges defaults, and uses {} for a StateProps-only component', () => {
    const { code } = run(
      `type StateProps = { n: number };
const X = ({ n }: StateProps) => <b>{n}</b>;
export default withGlobal((global): Complete<StateProps> => ({ n: global.n }), activate)(X);
const Y = ({ size = 1, m }: OwnProps & StateProps) => <i>{size + m}</i>;
export const YConnected = withGlobal<OwnProps>(mapY)(Y);`,
      ['props', 'withGlobal'],
    );
    // two connected components in one module: the mapper names carry the component name
    expectIncludes(
      code,
      'const X = () => { const props = withGlobal({}, mapStateToPropsX, activate); return <b>{props.n}</b>; };',
    );
    expectIncludes(code, 'const mapStateToPropsX = (global: GlobalState): Complete<StateProps> => ({ n: global.n });');
    expectIncludes(code, 'export default X;');
    // a destructuring default of a connected component is read inline, for `undefined` only (not `??`)
    expectIncludes(
      code,
      'const props = withGlobal(ownProps, mapY); return <i>{(props.size === undefined ? 1 : props.size) + props.m}</i>;',
    );
    expectIncludes(code, 'export const YConnected = Y;');
  });

  it('useSelector keeps its call and returns an accessor; getGlobal() in a memo / JSX is flagged', () => {
    const { code, report } = run(
      `const X = (props: { id: string }) => {
  const chat = useSelector((global) => global.chats[props.id]);
  const title = useMemo(() => getGlobal().chats[props.id].title, [props.id]);
  const onClick = () => getGlobal().x;
  return <div onClick={onClick}>{chat.title} {title} {getGlobal().y}</div>;
};`,
    );
    expectIncludes(code, 'const chat = useSelector((global) => global.chats[props.id]);');
    expectIncludes(code, '{chat().title} {title()} {getGlobal().y}');
    expectIncludes(code, 'const onClick = () => getGlobal().x;');
    expect(report.todos.map((t) => t.kind)).toEqual(['getGlobal-tracked', 'getGlobal-tracked']);
  });
});

describe('state, memos, callbacks', () => {
  it('useState → createSignal (lazy init, no-arg form), reads → x(), setters untouched', () => {
    const { code } = run(
      `import { useState } from '../../lib/teact/teact';
const X = () => {
  const [n, setN] = useState(0);
  const [lazy] = useState(() => compute());
  const [maybe, setMaybe] = useState<string>();
  const bump = () => setN((v) => v + 1);
  return <button onClick={bump}>{n} {lazy} {maybe}</button>;
};`,
    );
    expectIncludes(code, 'const [n, setN] = createSignal(0);');
    expectIncludes(code, 'const [lazy] = createSignal((() => compute())());');
    expectIncludes(code, 'const [maybe, setMaybe] = createSignal<string | undefined>(undefined);');
    expectIncludes(code, '{n()} {lazy()} {maybe()}');
    expectIncludes(code, "import { createSignal } from 'frameact';");
  });

  it('useMemo → createMemo with reads x(); useMemo(fn, []) → a plain value; callbacks unwrapped', () => {
    const { code } = run(
      `const X = (props: { a: number }) => {
  const doubled = useMemo(() => props.a * 2, [props.a]);
  const debounced = useMemo(() => debounce(() => {}, 100), []);
  const handle = useLastCallback((e: MouseEvent) => { debounced(); });
  const other = useCallback(() => doubled, [doubled]);
  return <div onClick={handle}>{doubled} {other()}</div>;
};`,
      ['state', 'accessorReads'],
    );
    expectIncludes(code, 'const doubled = createMemo(() => props.a * 2);');
    expectIncludes(code, 'const debounced = debounce(() => {}, 100);');
    expectIncludes(code, 'const handle = (e: MouseEvent) => { debounced(); };');
    expectIncludes(code, 'const other = () => doubled();');
    expectIncludes(code, '{doubled()} {other()}');
  });

  it('keeps parentheses where a bare arrow would not parse', () => {
    const { code } = run(`const f = useLastCallback((...args: any[]) => run(args)) as T;`, ['state']);
    expectIncludes(code, 'const f = ((...args: any[]) => run(args)) as T;');
  });
});

describe('refs', () => {
  it('element refs become let el!: T with ref={el}; value refs plain lets; .current dropped', () => {
    const { code } = run(
      `const X = () => {
  const containerRef = useRef<HTMLDivElement>();
  const timerRef = useRef<number | undefined>();
  const flagRef = useRef(false);
  const focus = () => containerRef.current?.focus();
  const { observe } = useIntersectionObserver({ rootRef: containerRef });
  return <div ref={containerRef} onClick={() => { timerRef.current = 1; flagRef.current = true; }} />;
};`,
      ['refs'],
    );
    expectIncludes(code, 'let containerRef!: HTMLDivElement;');
    expectIncludes(code, 'let timerRef: number | undefined;');
    expectIncludes(code, 'let flagRef = false;');
    expectIncludes(code, 'containerRef?.focus()');
    expectIncludes(code, 'useIntersectionObserver({ rootRef: () => containerRef })');
    expectIncludes(code, 'timerRef = 1; flagRef = true;');
    expectIncludes(code, '<div ref={containerRef}');
  });

  it('a ref passed as a non-ref prop becomes a callback ref; a reassigned ref is reported', () => {
    const { code, report } = run(
      `const X = (props: OwnProps) => {
  let el = useRef<HTMLDivElement>();
  if (props.ref) el = props.ref;
  return <Modal dialogRef={el} />;
};`,
      ['refs'],
    );
    expectIncludes(code, 'dialogRef={(el) => { el = el; }}'.replace('(el) => { el = el; }', '(el) => { el = el; }'));
    expect(report.todos.map((t) => t.kind)).toContain('ref-reassign');
  });
});

describe('effects', () => {
  it('maps deps to the compute half, [] to onMount, layout reads to measure, layout effects to mutation', () => {
    const { code, report } = run(
      `const X = (props: { isOpen: boolean }) => {
  const [n] = useState(0);
  useEffect(() => { if (!props.isOpen) return undefined; return subscribe(); }, [props.isOpen]);
  useEffect(() => { mount(); return () => unmount(); }, []);
  useEffect(() => { const h = el.offsetHeight; use(h, n); }, [n]);
  useLayoutEffect(() => { el.classList.add('x'); }, [props.isOpen, n]);
  useUnmountCleanup(() => stop());
  useEffectOnce(() => once());
  return <div />;
};`,
    );
    expectIncludes(
      code,
      'createEffect(() => props.isOpen, (isOpen2) => { if (!isOpen2) return undefined; return subscribe(); });',
    );
    expectIncludes(code, 'onMount(() => { mount(); return () => unmount(); });');
    // an accessor dependency is received as a value by apply
    expectIncludes(code, 'createMeasureEffect(() => n(), (n2) => { const h = el.offsetHeight; use(h, n2); });');
    expectIncludes(code, 'createMutationEffect(depsOf(() => [props.isOpen, n()] as const), ([isOpen2, n2]) => {');
    expectIncludes(code, 'onDestroy(() => stop());');
    expectIncludes(code, 'onMount(() => once());');
    expect(report.hits).toMatchObject({ onMount: 2, onDestroy: 1, createMeasureEffect: 1, createMutationEffect: 1 });
    expect(report.todos).toEqual([]);
  });

  it('turns prev-deps callbacks into apply(value, prev) and keeps a TODO on sync effects', () => {
    const { code, report } = run(
      `const X = (props: { a: number }) => {
  useEffectWithPrevDeps(([prevA]) => { log(prevA, props.a); }, [props.a]);
  useSyncEffect(() => { sync(props.a); }, [props.a]);
  return <div />;
};`,
      ['effects'],
    );
    expectIncludes(
      code,
      'createEffect(() => [props.a], (_deps, prev) => { const [prevA] = prev ?? []; log(prevA, props.a); });',
    );
    expectIncludes(code, 'createEffect(() => props.a, (a2) => { sync(a2); });');
    expect(report.todos.map((t) => t.kind)).toEqual(['sync-effect']);
  });
});

describe('derived hooks and the kit', () => {
  it('maps usePrevious / useCurrentOrPrev / useFrozenProps and useShowTransition', () => {
    const { code } = run(
      `const X = (props: OwnProps) => {
  const prev = usePreviousDeprecated(props.id, true);
  const shown = useCurrentOrPrev(props.user, true);
  const { ref, shouldRender, getIsClosing } = useShowTransition<HTMLDivElement>({ isOpen: props.isOpen, withShouldRender: true, noCloseTransition: props.fast, shouldForceOpen: props.force, closeDuration: 100 });
  return shouldRender ? <div ref={ref}>{prev} {shown?.name} {getIsClosing()}</div> : undefined;
};`,
      ['derivedHooks', 'kit', 'accessorReads'],
    );
    expectIncludes(code, 'const prev = previous(() => props.id, { skipUndefined: true });');
    expectIncludes(code, 'const shown = currentOrPrev(() => props.user, { skipUndefined: true });');
    expectIncludes(
      code,
      'const { ref, shouldRender, isClosing: getIsClosing } = createShowTransition({ isOpen: () => props.isOpen, noCloseTransition: () => props.fast, forceOpen: () => props.force, closeDuration: 100 });',
    );
    expectIncludes(code, 'shouldRender() ? <div ref={ref}>{prev()} {shown()?.name} {getIsClosing()}</div>');
  });

  it('reports the class-name based deprecated transition', () => {
    const { code, report } = run(
      `const X = (props: { isOpen: boolean }) => {
  const { transitionClassNames } = useShowTransitionDeprecated(props.isOpen, undefined, true);
  return <div className={transitionClassNames} />;
};`,
      ['kit'],
    );
    expectIncludes(code, 'createShowTransition({ isOpen: () => props.isOpen, noMountTransition: true })');
    expect(report.todos.map((t) => t.kind)).toEqual(['transition-classes']);
  });
});

describe('hooks: primitives, TODOs and accessor arguments', () => {
  it('useHeavyAnimation → watchHeavyAnimation, useForceUpdate → TODO, app hook value args → accessors', () => {
    const { code, report } = run(
      `const X = (props: { isOpen: boolean; onClose: () => void }) => {
  const [isShown, show] = useFlag();
  useHeavyAnimation(onStart, onEnd);
  const forceUpdate = useForceUpdate();
  useHistoryBack({ isActive: props.isOpen, onBack: props.onClose });
  useHorizontalScroll(isShown, props.isOpen && isShown);
  return <div onClick={show} />;
};`,
      ['hooks', 'accessorReads'],
    );
    expectIncludes(code, 'watchHeavyAnimation(onStart, onEnd);');
    expectIncludes(code, 'useHistoryBack({ isActive: () => props.isOpen, onBack: props.onClose });');
    expectIncludes(code, 'useHorizontalScroll(() => isShown(), () => props.isOpen && isShown());');
    expect(report.todos.map((t) => t.kind)).toEqual(['hook:useForceUpdate']);
  });

  it('a hook body returns its accessors bare and gets one signature TODO', () => {
    const { code, report } = run(
      `const useFlag = (initial = false) => {
  const [value, setValue] = useState(initial);
  const setTrue = useCallback(() => { setValue(true); }, []);
  return [value, setTrue];
};
export default useFlag;`,
    );
    expectIncludes(code, 'const [value, setValue] = createSignal(initial);');
    expectIncludes(code, 'return [value, setTrue];');
    expect(report.todos.map((t) => t.kind)).toEqual(['hook-params']);
  });
});

describe('derived values and early returns', () => {
  it('memoises body consts over props/signals, expands reactive destructuring, flags run-once statements', () => {
    const { code, report } = run(
      `const X = (props: { notification: N; disabled?: boolean }) => {
  const { localId, duration = 3000 } = props.notification;
  const [open] = useState(true);
  const isOff = props.disabled || !open;
  const lang = useOldLang();
  const title = lang('Key');
  if (isOff) counter++;
  return <div data-id={localId} data-d={duration} class={isOff && 'off'} title={title} />;
};`,
    );
    expectIncludes(code, 'const localId = () => props.notification.localId;');
    expectIncludes(
      code,
      'const duration = () => (props.notification.duration === undefined ? 3000 : props.notification.duration);',
    );
    expectIncludes(code, 'const isOff = createMemo(() => props.disabled || !open());');
    expectIncludes(code, "const title = createMemo(() => lang('Key'));");
    expectIncludes(code, "data-id={localId()} data-d={duration()} class={isOff() && 'off'} title={title()}");
    expect(report.todos.map((t) => t.kind)).toEqual(['runs-once']);
  });

  it('rewrites a trailing early return into <Show>, past render helpers', () => {
    const { code, report } = run(
      `const X = (props: { items?: string[]; href?: string }) => {
  if (!props.items) {
    return undefined;
  }
  if (props.href) return <a href={props.href} />;
  function renderItem(item: string) { return <li>{item}</li>; }
  return (
    <ul>{props.items.map(renderItem)}</ul>
  );
};`,
    );
    expectIncludes(code, '<Show when={props.items}> <Show when={!props.href} fallback={<a href={props.href} />}> <ul>');
    expectIncludes(code, '</ul> </Show> </Show>');
    expectIncludes(code, "import { Show } from 'frameact/dom';");
    expect(report.todos).toEqual([]);
  });
});

describe('forwardedHandlers', () => {
  it('a handler forwarded from props to an element calls through the prop; components and body functions stay', () => {
    const { code } = run(
      `const X = (props: { onClick?: () => void; onOpen?: () => void }) => {
  const handleOpen = () => {};
  return <div onClick={props.onClick} onMouseDown={handleOpen}><Child onOpen={props.onOpen} /></div>;
};`,
      ['forwardedHandlers'],
    );
    expectIncludes(code, '<div onClick={(e) => props.onClick?.(e)} onMouseDown={handleOpen}>');
    expectIncludes(code, '<Child onOpen={props.onOpen} />');
  });
});

describe('effectDeps', () => {
  it('an effect compute that returns an array compares by value; a single value and a wrapped compute stay', () => {
    const { code } = run(
      `const X = (props: { a: number; b: number }) => {
  createEffect(() => [props.a, props.b], ([a, b]) => { go(a, b); });
  createEffect(() => props.a, (a) => { one(a); });
  createEffect(depsOf(() => [props.a, props.b]), ([a, b]) => { go(a, b); });
  return <div />;
};`,
      ['effectDeps'],
    );
    expectIncludes(code, 'createEffect(depsOf(() => [props.a, props.b]), ([a, b]) => { go(a, b); });');
    expectIncludes(code, 'createEffect(() => props.a, (a) => { one(a); });');
    expectIncludes(code, 'createEffect(depsOf(() => [props.a, props.b]), ([a, b]) => { go(a, b); });');
  });
});

describe('inputEvents', () => {
  it('onChange on an intrinsic non-select element → onInput; select and components keep it', () => {
    const { code } = run(
      `const X = (props: { onChange: () => void }) => (
  <form>
    <input type="text" onChange={props.onChange} />
    <textarea onChange={props.onChange} />
    <select onChange={props.onChange} />
    <Foo onChange={props.onChange} />
  </form>
);`,
      ['inputEvents'],
    );
    expectIncludes(code, '<input type="text" onInput={props.onChange} />');
    expectIncludes(code, '<textarea onInput={props.onChange} />');
    expectIncludes(code, '<select onChange={props.onChange} />');
    expectIncludes(code, '<Foo onChange={props.onChange} />');
  });
});

describe('attributes', () => {
  it('camelCase DOM attributes → HTML names on intrinsic elements only', () => {
    const { code } = run(
      `const X = () => <form><input autoComplete="off" spellCheck={false} /><Foo autoComplete="x" /></form>;`,
      ['attributes'],
    );
    expectIncludes(code, '<input autocomplete="off" spellcheck={false} />');
    expectIncludes(code, '<Foo autoComplete="x" />');
  });
});

describe('jsx', () => {
  it('className → class on elements only; reactive .map → <For> (keyed when the row had key=)', () => {
    const { code } = run(
      `const X = (props: { chats: Chat[] }) => {
  const [list] = useState<Row[]>([]);
  return (
    <div className="root">
      <Button className="x" />
      {props.chats.map((chat) => <Chat key={chat.id} className="row" id={chat.id} title={chat.title} />)}
      {list.map(({ x }) => <i key={x}>{x}</i>)}
      {STATIC.map((s) => <b>{s}</b>)}
    </div>
  );
};`,
    );
    expectIncludes(code, '<div class="root">');
    expectIncludes(code, '<Button className="x" />');
    expectIncludes(
      code,
      '<For each={props.chats} keyed={(chat) => chat.id}>{(chat) => <Chat className="row" id={chat().id} title={chat().title} />}</For>',
    );
    expectIncludes(code, '<For each={list()}>{({ x }) => <i>{x}</i>}</For>');
    expectIncludes(code, '{STATIC.map((s) => <b>{s}</b>)}');
  });

  it('teactFastList + teactOrderKey → <ManualFor orderKey>; controlled inputs; key and Transition TODOs', () => {
    const { code, report } = run(
      `const X = (props: { ids: string[]; value: string; k: number }) => (
  <div>
    <div className="list" teactFastList>
      {props.ids.map((id) => <Row key={id} teactOrderKey={order(id)} id={id} />)}
    </div>
    <input value={props.value} teactExperimentControlled onInput={noop} />
    <Timer key={props.k} />
    <Transition activeKey={props.k} name="slide">
      <div>a</div>
    </Transition>
  </div>
);`,
    );
    expectIncludes(
      code,
      '<ManualFor each={props.ids} keyed={(id) => id} orderKey={(id) => order(id)}>{(id) => <Row id={id()} />}</ManualFor>',
    );
    expectIncludes(code, '<input use:value={() => props.value} onInput={noop} />');
    expectIncludes(
      code,
      '{/* TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{(key) => …}</Show> (the callback MUST take an argument, a zero-argument child is a plain child and never remounts; a falsy key such as 0 renders nothing: use when={{ id: key }}) */}',
    );
    expect(report.todos.map((t) => t.kind).sort()).toEqual(['key-remount', 'transition-children']);
    expectIncludes(code, "import { ManualFor } from 'frameact/dom';");
  });
});

describe('controlled native inputs', () => {
  it('value= / checked= on a native input, textarea and select become use:value / use:checked (the RangeSlider case)', () => {
    const { code, report } = run(
      `const X = (props: { value: number; text?: string; on: boolean; mode: string }) => (
  <div>
    <input min={0} value={props.value} step={1} type="range" onChange={noop} />
    <textarea value={props.text || ''} />
    <select value={props.mode}><option value="a">a</option></select>
    <input type="checkbox" checked={props.on} />
    <input type={props.on ? 'text' : 'password'} value={props.on ? props.text : ''} />
  </div>
);`,
      ['jsx'],
    );
    expectIncludes(code, '<input min={0} use:value={() => props.value} step={1} type="range" onChange={noop} />');
    expectIncludes(code, "<textarea use:value={() => props.text || ''} />");
    expectIncludes(code, '<select use:value={() => props.mode}>');
    expectIncludes(code, '<input type="checkbox" use:checked={() => props.on} />');
    expectIncludes(
      code,
      "<input type={props.on ? 'text' : 'password'} use:value={() => props.on ? props.text : ''} />",
    );
    expect(report.hits.controlled).toBe(5);
  });

  it('teactExperimentControlled on a native input is dropped, on a component only the flag goes (the component controls its own input)', () => {
    const { code } = run(
      `const X = (props: { v: string }) => (
  <>
    <input value={props.v} teactExperimentControlled onInput={noop} />
    <InputText value={props.v} teactExperimentControlled onChange={noop} />
  </>
);`,
      ['jsx'],
    );
    expectIncludes(code, '<input use:value={() => props.v} onInput={noop} />');
    expectIncludes(code, '<InputText value={props.v} onChange={noop} />');
    expect(code).not.toContain('teactExperimentControlled');
  });

  it('leaves attributes alone: a checkbox / radio / file / button value, static values, spreads, components, option', () => {
    const src = `const X = (props: { id: string; rest: object }) => (
  <div>
    <input type="checkbox" value={props.id} />
    <input type="radio" value={props.id} checked />
    <input type="file" value={props.id} />
    <input type="submit" value={props.id} />
    <input value="x" checked={true} />
    <input value={undefined} />
    <input {...props.rest} />
    <Checkbox value={props.id} checked={props.id === 'a'} />
    <option value={props.id}>a</option>
  </div>
);`;
    const { code, report } = run(src, ['jsx']);
    expect(squash(code)).toBe(squash(src));
    expect(report.hits.controlled).toBeUndefined();
  });

  it('a reactive read from an earlier rule (signal / memo) is thunked as is; an accessor stays', () => {
    const { code } = run(
      `const X = () => {
  const [text, setText] = useState('');
  return <input value={text} onChange={(e) => setText(e.currentTarget.value)} />;
};`,
    );
    expectIncludes(code, 'use:value={() => text()}');
    expectIncludes(code, 'onInput={(e) => setText(e.currentTarget.value)}');
  });
});

describe('store contract: trackGlobal and identity deps', () => {
  it('wraps getGlobal()-reading helpers in trackGlobal inside memos, effects, JSX and hook bodies, not in handlers or mappers', () => {
    const { code, report } = run(
      `const useThing = (chat: () => ApiChat) => {
  return getCanPostInChat(chat());
};
const X = (props: { chat: ApiChat }) => {
  const canPost = useMemo(() => getCanPostInChat(props.chat), [props.chat]);
  const status = useSelector((global) => getGroupStatus(global, props.chat));
  useEffect(() => { log(getPeerColorCount(props.chat)); }, [props.chat]);
  const onClick = () => sortChatIds(getGlobal(), ids);
  return <div onClick={onClick} title={renderMessageSummary(props.chat)}>{canPost}</div>;
};`,
    );
    expectIncludes(code, 'return trackGlobal(() => getCanPostInChat(chat()));');
    expectIncludes(code, 'const canPost = createMemo(() => trackGlobal(() => getCanPostInChat(props.chat)));');
    expectIncludes(code, 'const status = useSelector((global) => getGroupStatus(global, props.chat));');
    expectIncludes(code, 'log(trackGlobal(() => getPeerColorCount(chat2)));');
    expectIncludes(code, 'const onClick = () => sortChatIds(getGlobal(), ids);');
    expectIncludes(code, 'title={trackGlobal(() => renderMessageSummary(props.chat))}');
    expectIncludes(code, "import { getGlobal, trackGlobal } from '../../global';");
    expect(report.hits.trackGlobal).toBe(4);
  });

  it('flags identity dependencies on container props (no id), not on entities', () => {
    const { report } = run(
      `type OwnProps = { chat: ApiChat; tabState: TabState; settings: { theme: string } };
const X = (props: OwnProps) => {
  const a = useMemo(() => f(props.chat), [props.chat]);
  const b = useMemo(() => g(props.settings), [props.settings]);
  useEffect(() => { h(props.tabState); }, [props.tabState, props.chat]);
  return <div>{a} {b}</div>;
};`,
    );
    expect(report.todos.map((t) => [t.kind, /\((.*?)\)/.exec(t.message)?.[1]])).toEqual([
      ['identity-dep', 'settings'],
      ['identity-dep', 'tabState'],
    ]);
  });
});

describe('async wrappers', () => {
  it('useModuleLoader → module-level lazy() + <Show>', () => {
    const { code, report } = run(
      `import type { OwnProps } from './CalendarModal';
import { Bundles } from '../../util/moduleLoader';
import useModuleLoader from '../../hooks/useModuleLoader';
const CalendarModalAsync = (props: OwnProps) => {
  const { isOpen } = props;
  const CalendarModal = useModuleLoader(Bundles.Extra, 'CalendarModal', !isOpen);
  return CalendarModal ? <CalendarModal {...props} /> : undefined;
};
export default CalendarModalAsync;`,
    );
    expectIncludes(
      code,
      'const CalendarModal = lazy<OwnProps>(() => loadBundle(Bundles.Extra).then((m) => ({ default: m.CalendarModal })));',
    );
    expectIncludes(code, '<Show when={props.isOpen}> <CalendarModal {...props} /> </Show>');
    expectIncludes(code, "import { Bundles, loadBundle } from '../../util/moduleLoader';");
    expect(code).not.toContain('useModuleLoader');
    expect(report.todos).toEqual([]);
  });

  it('keeps the loading fallback as the placeholder and types a propless wrapper', () => {
    const { code } = run(
      `import { Bundles } from '../../util/moduleLoader';
import useModuleLoader from '../../hooks/useModuleLoader';
import Loading from '../ui/Loading';
const AuthCodeAsync = () => {
  const AuthCode = useModuleLoader(Bundles.Auth, 'AuthCode');
  return AuthCode ? <AuthCode /> : <Loading />;
};
export default AuthCodeAsync;`,
    );
    expectIncludes(
      code,
      'const AuthCode = lazy<Record<string, never>>(() => loadBundle(Bundles.Auth).then((m) => ({ default: m.AuthCode })), { placeholder: () => <Loading /> });',
    );
  });
});

describe('imports', () => {
  it('moves fasterdom / teact-dom / stricterdom names, keeps unmapped teact names with a TODO', () => {
    const { code, report } = run(
      `import { useRef, beginHeavyAnimation, Fragment } from '../../lib/teact/teact';
import { addExtraClass } from '../../lib/teact/teact-dom';
import { requestMutation } from '../../lib/fasterdom/fasterdom';
import { forceMeasure } from '../../lib/fasterdom/stricterdom';
import useLastCallback from '../../hooks/useLastCallback';
const X = () => {
  const el = useRef<HTMLDivElement>();
  const go = useLastCallback(() => { beginHeavyAnimation(); requestMutation(() => addExtraClass(el.current!, 'x')); forceMeasure(() => 1); });
  return <Fragment><div ref={el} onClick={go} /></Fragment>;
};`,
    );
    expectIncludes(code, "import { beginHeavyAnimation, requestMutation } from 'frameact';");
    expectIncludes(code, "import { addExtraClass } from 'frameact/dom';");
    expectIncludes(code, "import { forceMeasure } from 'frameact/stricterdom';");
    expectIncludes(code, "import { Fragment } from '../../lib/teact/teact';");
    expect(code).not.toContain('useLastCallback');
    expect(report.todos.map((t) => t.kind)).toEqual(['teact-leftover']);
  });

  it('is byte-identical on lines it does not touch and leaves a plain module alone', () => {
    const source = `import buildClassName from '../../util/buildClassName';\n\nexport function helper(a: string) {\n  return buildClassName('x', a);\n}\n`;
    expect(run(source).code).toBe(source);
  });
});
