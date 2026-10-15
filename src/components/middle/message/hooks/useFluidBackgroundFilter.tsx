import { type Accessor, createEffect, createSignal } from 'frameact';

import { SVG_NAMESPACE } from '../../../../config';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { addSvgDefinition, removeSvgDefinition } from '../../../../util/svgController';

const SVG_MAP = new Map<string, SvgFluidBackgroundFilter>();

class SvgFluidBackgroundFilter {
  public filterId: string;

  private referenceCount = 0;

  constructor(public color: string) {
    this.filterId = `fluid-background-filter-${color.slice(1)}`;

    addSvgDefinition(
      (
        <filter color-interpolation-filters="sRGB" xmlns={SVG_NAMESPACE}>
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
          <feColorMatrix
            in="blur"
            attr:mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 30 -15"
            result="goo"
          />
          <feComposite in="SourceAlpha" in2="goo" operator="over" result="outline" />
          <feFlood flood-color={color} result="color" />
          <feComposite in="color" in2="outline" operator="in" />
        </filter>
      ) as Element,
      this.filterId,
    );
  }

  public getFilterId() {
    this.referenceCount += 1;
    return this.filterId;
  }

  public removeReference() {
    this.referenceCount -= 1;
    if (this.referenceCount === 0) {
      removeSvgDefinition(this.filterId);
    }
  }

  public isUsed() {
    return this.referenceCount > 0;
  }
}

// Deviation: a hook runs once. `color` is a `MaybeAccessor` and the result is an accessor of the style (or `undefined`).
// tt took a reference of the shared filter at each render and released one on the color change; here the reference is
// taken when the color is applied and released when it changes or the owner is disposed (a balanced count).
export default function useFluidBackgroundFilter(
  color?: MaybeAccessor<string | undefined>,
  asValue?: boolean,
): Accessor<string | undefined> {
  const [style, setStyle] = createSignal<string | undefined>(undefined);

  createEffect(
    () => read(color),
    (color2) => {
      if (!color2) {
        setStyle(undefined);
        return undefined;
      }

      const svg = SVG_MAP.get(color2) || new SvgFluidBackgroundFilter(color2);
      SVG_MAP.set(color2, svg);
      setStyle(prepareStyle(svg.getFilterId(), asValue));

      return () => {
        svg.removeReference();
        if (!svg.isUsed() && SVG_MAP.get(color2) === svg) {
          SVG_MAP.delete(color2);
        }
      };
    },
  );

  return style;
}

function prepareStyle(filterId: string, asValue?: boolean) {
  if (asValue) {
    return `url(#${filterId})`;
  }

  return `filter: url(#${filterId});`;
}
