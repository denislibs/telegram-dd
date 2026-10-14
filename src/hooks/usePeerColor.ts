import { type Accessor, createMemo } from 'frameact';
import { trackGlobal } from '../global';

import type { ApiPeer, ApiTypePeerColor } from '../api/types';
import type { CustomPeer, ThemeKey } from '../types';

import { getPeerColorCollectibleColorCount, getPeerColorCount, getPeerColorKey } from '../global/helpers';
import { type MaybeAccessor, read } from '../util/accessors';
import buildStyle from '../util/buildStyle';
import { generateColorVariations, generatePeerColorGradient } from '../util/theme';

type PeerColorAttributes = {
  className?: string;
  style?: string;
};

type PeerColorProperties = PeerColorAttributes & {
  backgroundEmojiId?: string;
  giftEmojiId?: string;
};

// Deviation: tt's `useSyncEffect` + ref is derived state here: the result is a memo.
export default function usePeerColor(options: {
  peer?: MaybeAccessor<ApiPeer | CustomPeer | undefined>;
  color?: MaybeAccessor<ApiTypePeerColor | undefined>;
  noUserColors?: MaybeAccessor<boolean | undefined>;
  shouldReset?: MaybeAccessor<boolean | undefined>;
  theme: MaybeAccessor<ThemeKey>;
}): Accessor<PeerColorProperties> {
  return createMemo(() => {
    const peer = read(options.peer);
    const color = read(options.color);
    const noUserColors = read(options.noUserColors);
    const shouldReset = read(options.shouldReset);
    const theme = read(options.theme);

    let propertiesRef: PeerColorAttributes = {};
    const realPeer = peer && !('isCustomPeer' in peer) ? peer : undefined;

    const updateProperties = () => {
      if (!peer) {
        if (!shouldReset) {
          propertiesRef = {};
          return;
        }

        propertiesRef = {
          className: noUserColors ? getPeerColorCountClass(1) : getPeerColorClass(0),
        };
        return;
      }

      if ('isCustomPeer' in peer) {
        if (peer.peerColorId === undefined) {
          propertiesRef = {};
          return;
        }

        propertiesRef = { className: `peer-color-${peer.peerColorId}`, style: undefined };
        return;
      }

      const peerColor = color || peer.color;
      const isCollectible = peerColor?.type === 'collectible';
      const colorCount = peer
        ? trackGlobal(() => getPeerColorCount(peer))
        : isCollectible
          ? getPeerColorCollectibleColorCount(peerColor)
          : 1;
      const colorCountClass = getPeerColorCountClass(colorCount);
      const key = isCollectible || !peerColor?.color ? getPeerColorKey(peer) : peerColor.color;

      if (noUserColors) {
        propertiesRef = { className: colorCountClass };
        return;
      }

      if (peerColor?.type === 'collectible' && !noUserColors) {
        const accentColor =
          theme === 'dark' && peerColor.darkAccentColor ? peerColor.darkAccentColor : peerColor.accentColor;
        const colors = theme === 'dark' && peerColor.darkColors ? peerColor.darkColors : peerColor.colors;
        const gradient = generatePeerColorGradient(colors);
        const { bg, bgActive } = generateColorVariations(accentColor);
        propertiesRef = {
          className: colorCountClass,
          style: buildStyle(
            `--bar-gradient: ${gradient}`,
            `--accent-color: ${accentColor}`,
            `--accent-background-color: ${bg}`,
            `--accent-background-active-color: ${bgActive}`,
          ),
        };
        return;
      }

      const className = noUserColors || key === undefined ? colorCountClass : getPeerColorClass(key);
      propertiesRef = { className, style: undefined };
    };
    updateProperties();

    return {
      style: propertiesRef.style,
      className: propertiesRef.className,
      backgroundEmojiId: realPeer?.color?.backgroundEmojiId,
      giftEmojiId: realPeer?.color?.type === 'collectible' ? realPeer.color.giftEmojiId : undefined,
    };
  });
}

export function getPeerColorClass(colorIndex: number) {
  return `peer-color-${colorIndex}`;
}

export function getPeerColorCountClass(colorCount: number) {
  return `peer-color-count-${colorCount}`;
}
