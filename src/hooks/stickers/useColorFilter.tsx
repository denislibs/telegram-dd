import { createMemo, onCleanup } from 'frameact';

import { SVG_NAMESPACE } from '../../config';
import { buildColor, convertColor } from '../../lib/color';
import { type MaybeAccessor, read } from '../../util/accessors';
import { addSvgDefinition, removeSvgDefinition } from '../../util/svgController';

const SVG_MAP = new Map<string, SvgColorFilter>();

class SvgColorFilter {
  public filterId: string;

  private referenceCount = 0;

  constructor(public color: string) {
    this.filterId = `color-filter-${color.slice(1)}`;

    const [r, g, b] = convertColor(buildColor(color), 'srgb').coords;
    addSvgDefinition(
      (
        <filter color-interpolation-filters="sRGB" xmlns={SVG_NAMESPACE}>
          <feColorMatrix type="matrix" values={`0 0 0 0 ${r || 0} 0 0 0 0 ${g || 0} 0 0 0 0 ${b || 0} 0 0 0 1 0`} />
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

// Deviation: tt took a reference on every render and released one per color change; here the memo takes it and cleans up.
export default function useColorFilter(
  color?: MaybeAccessor<string | undefined>,
  asValue?: MaybeAccessor<boolean | undefined>,
) {
  return createMemo(() => {
    const color2 = read(color);
    if (!color2) return undefined;

    onCleanup(() => {
      const colorFilter = SVG_MAP.get(color2);
      if (colorFilter) {
        colorFilter.removeReference();
        if (!colorFilter.isUsed()) {
          SVG_MAP.delete(colorFilter.color);
        }
      }
    });

    if (SVG_MAP.has(color2)) {
      const svg = SVG_MAP.get(color2)!;
      return prepareStyle(svg.getFilterId(), read(asValue));
    }

    const svg = new SvgColorFilter(color2);
    SVG_MAP.set(color2, svg);

    return prepareStyle(svg.getFilterId(), read(asValue));
  });
}

function prepareStyle(filterId: string, asValue?: boolean) {
  if (asValue) {
    return `url(#${filterId})`;
  }

  return `filter: url(#${filterId});`;
}
