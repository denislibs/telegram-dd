import { createSignal } from 'frameact';
import { createComponent, render } from 'frameact/dom';
import { suppressStrict } from 'frameact/stricterdom';

type TeactRendererOptions<Props extends AnyLiteral> = {
  props: Props;
  element?: HTMLElement;
};

const DEFAULT_RENDERER_ELEMENT_TAG = 'div';

// Deviation: tt re-rendered a teact component with new props. A frameact component runs once, so the props are
// getters over one signal (`updateProps` writes it) and only the bindings that read a changed key update. The key set is
// fixed by the first props object (it is a ProseMirror NodeViewProps, which always has the same keys).
// The element is created here and handed to ProseMirror as the node view's DOM: ProseMirror owns it from there; the
// component renders into it with `render()` and `destroy()` disposes that root.
export default class TeactRenderer<Props extends AnyLiteral = AnyLiteral> {
  public element: HTMLElement;

  private setProps: (props: Props) => void;

  private dispose: NoneToVoidFunction | undefined;

  constructor(
    private Component: (props: Props) => unknown,
    options: TeactRendererOptions<Props>,
  ) {
    this.element = options.element || document.createElement(DEFAULT_RENDERER_ELEMENT_TAG);

    const [props, setProps] = createSignal(options.props, { equals: false });
    this.setProps = setProps;

    const reactiveProps = {} as Props;
    (Object.keys(options.props) as (keyof Props)[]).forEach((key) => {
      Object.defineProperty(reactiveProps, key, { get: () => props()[key], enumerable: true });
    });

    suppressStrict(() => {
      this.dispose = render(() => createComponent(this.Component, reactiveProps), this.element);
    });
  }

  public updateProps(props: Props) {
    this.setProps(props);
  }

  public destroy() {
    this.dispose?.();
    this.dispose = undefined;
  }
}
