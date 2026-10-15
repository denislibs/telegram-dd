// Original test (not in telegram-tt): an unknown topic `icon_color` from the server falls back to grey instead of throwing.
import { describe, expect, it } from 'vitest';

import { getTopicColorCssVariable, getTopicColors, getTopicDefaultIcon } from './forumColors';

describe('forumColors', () => {
  it('maps the six known colors', () => {
    const [blue] = getTopicColors();
    expect(getTopicColorCssVariable(blue)).toBe('--color-topic-blue');
    expect(getTopicDefaultIcon(blue)).not.toBe(getTopicDefaultIcon(undefined));
  });

  it('falls back to grey for no color, zero and a color outside the mapping', () => {
    for (const color of [undefined, 0, 0x123456, -1, 1e9]) {
      expect(getTopicColorCssVariable(color)).toBe('--color-topic-grey');
      expect(getTopicDefaultIcon(color)).toBe(getTopicDefaultIcon(undefined));
    }
  });
});
