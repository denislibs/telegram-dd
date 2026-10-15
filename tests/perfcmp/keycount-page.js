// Page side of keycount.ts (plain JS, injected with addInitScript).
(() => {
  const byTarget = new Map();
  const kinds = { records: 0, childList: 0, attributes: 0, characterData: 0, added: 0, removed: 0 };
  let on = false;
  const describe = (node) => {
    let el = node instanceof Element ? node : node && node.parentElement;
    const path = [];
    while (el && path.length < 3) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      if (el.id || cls) path.unshift(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`);
      el = el.parentElement;
    }
    return path.join(' > ');
  };
  const start = () => {
    new MutationObserver((records) => {
      if (!on) return;
      for (const record of records) {
        kinds.records++;
        kinds[record.type]++;
        kinds.added += record.addedNodes.length;
        kinds.removed += record.removedNodes.length;
        const k = `${record.type}${record.attributeName ? `[${record.attributeName}]` : ''} ${describe(record.target)}`;
        byTarget.set(k, (byTarget.get(k) || 0) + 1);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  };
  const scrolls = new Map();
  document.addEventListener('scroll', (e) => {
    if (!on) return;
    const t = e.target === document ? 'document' : describe(e.target);
    scrolls.set(t, (scrolls.get(t) || 0) + 1);
  }, true);
  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  window.__kc = {
    reset() {
      byTarget.clear();
      scrolls.clear();
      for (const key of Object.keys(kinds)) kinds[key] = 0;
      on = true;
    },
    take() {
      on = false;
      return { kinds: { ...kinds }, byTarget: [...byTarget.entries()].sort((a, b) => b[1] - a[1]), scrolls: [...scrolls.entries()] };
    },
    async type(count, tag = '') {
      const input = document.querySelector('#editable-message-text');
      input.focus();
      for (let i = 0; i < count; i++) {
        performance.mark(`kc:key${tag}${i}`);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true, cancelable: true }));
        document.execCommand('insertText', false, 'x');
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'x', code: 'KeyX', bubbles: true }));
        await nextFrame();
        await nextFrame();
      }
      performance.mark(`kc:typed${tag}`);
    },
    async send(waitMs, tag = '') {
      performance.mark(`kc:send${tag}`);
      document.querySelector('.Composer .main-button').click();
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      performance.mark(`kc:sent${tag}`);
    },
  };
})();
