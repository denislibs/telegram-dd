// tsx tests/perfcmp/layers.ts --dir D: DOM size and composited layers (with reasons) while typing in the typing scenario's chat.
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { SCENARIO_HASH, serveDir } from './apps';
import { CHAT_LIST_ROW, pc } from './scenarios';

const { values: args } = parseArgs({ options: { dir: { type: 'string' }, label: { type: 'string', default: '' } } });
const server = await serveDir(args.dir!);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript({ path: join(import.meta.dirname, 'probe.js') });
  await page.addInitScript({ path: join(import.meta.dirname, 'keycount-page.js') });
  await page.goto(server.url + SCENARIO_HASH, { waitUntil: 'commit' });
  await pc<boolean>(page, 'waitForCount', CHAT_LIST_ROW, 1, 60_000);
  await pc(page, 'sleep', 2500);
  await pc<boolean>(page, 'openFirstChat', 5);
  await pc<boolean>(page, 'waitForCount', '#editable-message-text[contenteditable="true"]', 1, 20000);
  await pc(page, 'sleep', 1500);
  await page.evaluate(async () => {
    const kc = (window as any).__kc;
    await kc.type(20, 'a');
    await kc.send(1500, 'a');
    await kc.type(5, 'b');
  });
  await pc(page, 'sleep', 1000);
  const dom = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    let hidden = 0;
    let animated = 0;
    const anims = new Map<string, number>();
    for (const el of all) {
      const style = getComputedStyle(el);
      if (style.display === 'none') hidden++;
      if (style.animationName !== 'none' && style.animationPlayState === 'running') {
        animated++;
        const k = `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)
          .split(' ')
          .slice(0, 2)
          .join('.')} ${style.animationName} ${style.animationIterationCount}`;
        anims.set(k, (anims.get(k) ?? 0) + 1);
      }
    }
    const props = new Map<string, number>();
    const where = new Map<string, number>();
    for (const el of all) {
      const st = getComputedStyle(el);
      if (st.display === 'none') continue;
      const hits: string[] = [];
      if (st.transform !== 'none') hits.push('transform');
      if (Number(st.opacity) < 1) hits.push('opacity');
      if (st.filter !== 'none') hits.push('filter');
      if (st.backdropFilter && st.backdropFilter !== 'none') hits.push('backdrop');
      if (st.willChange !== 'auto') hits.push(`will-change:${st.willChange}`);
      if (st.clipPath !== 'none') hits.push('clip-path');
      if (st.mixBlendMode !== 'normal') hits.push('blend');
      if (st.isolation === 'isolate') hits.push('isolation');
      if (st.contain !== 'none') hits.push(`contain:${st.contain}`);
      if ((st.position === 'relative' || st.position === 'absolute') && st.zIndex !== 'auto') hits.push('z-index');
      if (st.position === 'sticky' || st.position === 'fixed') hits.push(st.position);
      if (st.overflow !== 'visible') hits.push('overflow-clip');
      if (st.maskImage && st.maskImage !== 'none') hits.push('mask');
      for (const h of hits) props.set(h, (props.get(h) ?? 0) + 1);
      if (hits.length) {
        const k = `${el.tagName.toLowerCase()}.${String(
          (el as HTMLElement).className?.baseVal ?? (el as HTMLElement).className,
        )
          .split(' ')
          .filter((c) => c && !/^[A-Za-z0-9_-]{8}$/.test(c))
          .slice(0, 2)
          .join('.')} [${hits.join(',')}]`;
        where.set(k, (where.get(k) ?? 0) + 1);
      }
    }
    return {
      props: [...props.entries()],
      where: [...where.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
      elements: all.length,
      hidden,
      animated,
      anims: [...anims.entries()],
      animations: document
        .getAnimations()
        .map((a) =>
          `${(a as CSSAnimation).animationName ?? a.constructor.name} ${(a.effect as KeyframeEffect)?.target?.className ?? ''}`.slice(
            0,
            120,
          ),
        ),
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('LayerTree.enable');
  const layers = await new Promise<
    { layerId: string; backendNodeId?: number; width: number; height: number; drawsContent: boolean }[]
  >((resolve) => {
    cdp.on('LayerTree.layerTreeDidChange', (event: { layers?: any[] }) => event.layers && resolve(event.layers));
    void page.evaluate(() => document.body.style.setProperty('--kc', String(Math.random())));
  });
  const withReasons = [];
  for (const layer of layers) {
    if (!layer.drawsContent) continue;
    const { compositingReasons } = await cdp
      .send('LayerTree.compositingReasons', { layerId: layer.layerId })
      .catch(() => ({ compositingReasons: [] as string[] }));
    let node = '';
    if (layer.backendNodeId) {
      const described = await cdp
        .send('DOM.describeNode', { backendNodeId: layer.backendNodeId })
        .catch(() => undefined);
      const n = described?.node;
      if (n) {
        node = `${n.localName}${(n.attributes ?? []).reduce((acc: string, v: string, i: number, arr: string[]) => (i % 2 === 0 && v === 'class' ? `${acc}.${arr[i + 1].split(' ').slice(0, 2).join('.')}` : acc), '')}`;
      }
    }
    withReasons.push(`${layer.width}x${layer.height} ${node} [${compositingReasons.join(',')}]`);
  }
  process.stdout.write(
    `${args.label} paint-property elements: ${JSON.stringify(dom.props)}\n  ${dom.where.map(([k, v]) => `${v} ${k}`).join('\n  ')}\n`,
  );
  process.stdout.write(
    `${args.label}: elements ${dom.elements}, display:none ${dom.hidden}, running CSS animations ${dom.animated}\n  ${dom.anims.map(([k, v]) => `${v} ${k}`).join('\n  ')}\n  getAnimations: ${dom.animations.join(' | ')}\n  layers drawing content: ${withReasons.length} (all ${layers.length})\n   ${withReasons.join('\n   ')}\n`,
  );
} finally {
  await browser.close();
  await server.close();
}
