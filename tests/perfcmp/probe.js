// Page side of the performance comparison. Injected with `addInitScript` into BOTH apps, so everything here runs in the
// page, in plain JS (no TypeScript, no imports): Playwright serialises page code with `toString()`, and the TS
// transpiler would add helpers to it. The harness (tests/perfcmp/runner.ts) talks to it through `window.__pc`.
//
// What it records, between `start()` and `stop()`: main-thread long tasks (PerformanceObserver), rAF timestamps (dropped
// frames), and DOM mutation records. It also places `performance.mark` marks that show up in the CDP trace, so the
// trace can be cut into windows (see trace.ts). It drives the scenarios (update injection, scrolling, folder clicks)
// from timers INSIDE the page, so Playwright round trips never add to, or hide, the main-thread work.
(() => {
  if (window.__pc) return;

  const FRAME_MS = 1000 / 60;
  const longTasks = [];
  const frames = [];
  const mutations = { records: 0, childList: 0, attributes: 0, characterData: 0, nodesAdded: 0, nodesRemoved: 0 };
  let active = false;
  let t0 = 0;
  let t1 = 0;
  let readyAt;
  let readyWatch;
  let nextMessageId = 1_000_000;

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask' });
  } catch {
    /* longtask is unsupported: the harness reports zeros and the trace metrics still work */
  }

  new MutationObserver((records) => {
    if (!active) return;
    for (const record of records) {
      mutations.records++;
      mutations[record.type]++;
      mutations.nodesAdded += record.addedNodes.length;
      mutations.nodesRemoved += record.removedNodes.length;
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });

  const onFrame = (time) => {
    if (active) frames.push(time);
    if (readyWatch && !readyAt && document.querySelectorAll(readyWatch.selector).length >= readyWatch.count) {
      readyAt = performance.now();
    }
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  const actions = () => window.getActions();
  const global = () => window.getGlobal();

  /** Chat ids in list order (rank 0 is the top of the list). */
  const listedChatIds = () => global().chats.listIds.active || [];

  function buildMessage(chatId, text) {
    const id = nextMessageId++;
    const isPrivate = global().chats.byId[chatId]?.type === 'chatTypePrivate';
    return {
      '@type': 'newMessage',
      id,
      chatId,
      message: {
        id,
        chatId,
        date: Math.floor(Date.now() / 1000) + (id - 1_000_000),
        isOutgoing: false,
        senderId: isPrivate ? chatId : undefined,
        content: { text: { text } },
      },
    };
  }

  /** Delivers `updates` through the app's own `apiUpdate` action, the entry the API worker's messages end up in. */
  const deliver = (update) => actions().apiUpdate(update);

  const pc = {
    FRAME_MS,

    start() {
      longTasks.length = 0;
      frames.length = 0;
      for (const key of Object.keys(mutations)) mutations[key] = 0;
      t0 = performance.now();
      t1 = 0;
      active = true;
      performance.mark('pc:start');
      return t0;
    },

    /** Ends the window and returns the raw samples (the harness derives the metrics from them). */
    stop() {
      t1 = performance.now();
      active = false;
      performance.mark('pc:end');
      return {
        t0,
        t1,
        readyAt,
        longTasks: longTasks.filter((task) => task.start >= t0 && task.start <= t1),
        frames: frames.slice(),
        mutations: { ...mutations },
      };
    },

    mark(name) {
      performance.mark(name);
      return performance.now();
    },

    now: () => performance.now(),

    /** Records when `count` elements match `selector` for the first time (checked every frame). */
    watchReady(selector, count = 1) {
      readyWatch = { selector, count };
      readyAt = undefined;
    },
    ready: () => readyAt,
    sleep,
    nextFrame,

    count: (selector) => document.querySelectorAll(selector).length,

    /** Resolves once `selector` matches `count` elements, or false after `timeoutMs`. */
    async waitForCount(selector, count, timeoutMs) {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (document.querySelectorAll(selector).length >= count) return true;
        await sleep(50);
      }
      return false;
    },

    listedChatIds,

    /** Resolves when the app shows no folder-switch animation (a Transition slide in progress). */
    async waitForTransitionEnd(timeoutMs = 3000) {
      const animating = () =>
        document.querySelector('.ChatFolders .Transition_slide-from, .ChatFolders .Transition_slide-to');
      const deadline = performance.now() + timeoutMs;
      while (animating() && performance.now() < deadline) await nextFrame();
      return performance.now();
    },

    // ---- scenario drivers ----------------------------------------------------------------------------------------

    /**
     * Scenario 2. A message arrives in each chat of `ranks` (positions in the list, below the top), moving the chat to
     * the top. `mode` 'burst': all in one task; 'sequence': one per task, `gapMs` apart.
     */
    async newMessages(ranks, mode, gapMs) {
      const ids = listedChatIds();
      const updates = ranks.map((rank, index) => buildMessage(ids[rank], `perf message ${index}`));
      if (mode === 'burst') {
        await new Promise((resolve) =>
          setTimeout(() => {
            for (const update of updates) deliver(update);
            resolve();
          }, 0),
        );
        return;
      }
      for (const update of updates) {
        await new Promise((resolve) =>
          setTimeout(() => {
            deliver(update);
            resolve();
          }, gapMs),
        );
      }
    },

    /**
     * Scenario 3. `ratePerSecond` updates per second for `durationMs`: typing indicators in the private chats at the top
     * of the list and online/offline status flips of their users, from a timer that catches up after a slow tick (the
     * rate stays the same when the page is slow, as it would from a socket).
     */
    async storm(ratePerSecond, durationMs) {
      const ids = listedChatIds()
        .slice(0, 80)
        .filter((id) => global().chats.byId[id]?.type === 'chatTypePrivate');
      const total = Math.round((ratePerSecond * durationMs) / 1000);
      const start = performance.now();
      let sent = 0;
      while (sent < total) {
        const due = Math.min(total, Math.floor(((performance.now() - start) / 1000) * ratePerSecond) + 1);
        for (; sent < due; sent++) {
          const id = ids[sent % ids.length];
          if (sent % 2 === 0) {
            deliver({
              '@type': 'updateChatTypingStatus',
              id,
              peerId: id,
              typingStatus: { action: 'typing', timestamp: Date.now() + sent },
            });
          } else {
            deliver({
              '@type': 'updateUserStatus',
              userId: id,
              status:
                Math.floor(sent / ids.length) % 2 === 0
                  ? { type: 'userStatusOnline', expires: Math.floor(Date.now() / 1000) + 300 }
                  : { type: 'userStatusOffline', wasOnline: Math.floor(Date.now() / 1000) },
            });
          }
        }
        await sleep(10);
      }
      return sent;
    },

    /** Scenario 4. Scrolls the active chat list from the top to the very bottom, `stepPx` per frame. */
    async scrollToBottom(stepPx, maxMs) {
      const list = document.querySelector('.chat-list.Transition_slide-active') || document.querySelector('.chat-list');
      const start = performance.now();
      list.scrollTop = 0;
      await nextFrame();
      let lastHeight = list.scrollHeight;
      let stableSince = performance.now();
      let frameCount = 0;
      while (performance.now() - start < maxMs) {
        list.scrollTop += stepPx;
        frameCount++;
        await nextFrame();
        const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
        if (list.scrollHeight !== lastHeight) {
          lastHeight = list.scrollHeight;
          stableSince = performance.now();
        }
        if (atBottom && performance.now() - stableSince > 600) break;
      }
      return { frames: frameCount, scrollHeight: list.scrollHeight, scrollTop: list.scrollTop };
    },

    /**
     * Scenario 7. Opens the chat at the top of the list (the one with the long history) through the app's own action and
     * resolves when its first message is rendered; false when the app shows no message list.
     */
    async openFirstChat(rank = 0) {
      actions().openChat({ id: listedChatIds()[rank] });
      return pc.waitForCount('#MiddleColumn .MessageList .message-list-item', 1, 20000);
    },

    /**
     * Scenario 7. Scrolls the open message list up, `stepPx` per frame, until it reached the first message of the
     * history or `maxMs` passed (the history pages in as it goes).
     */
    async scrollHistoryUp(stepPx, maxMs) {
      const list = document.querySelector('#MiddleColumn .MessageList');
      if (!list) return { frames: 0, messages: 0, firstId: 0 };
      const start = performance.now();
      let frameCount = 0;
      let lastCount = 0;
      let stableSince = performance.now();
      const ids = () => [...list.querySelectorAll('.message-list-item')].map((el) => Number(el.dataset.messageId));
      while (performance.now() - start < maxMs) {
        list.scrollTop -= stepPx;
        frameCount++;
        await nextFrame();
        const count = list.querySelectorAll('.message-list-item').length;
        if (count !== lastCount) {
          lastCount = count;
          stableSince = performance.now();
        }
        if (list.scrollTop <= 1 && Math.min(...ids()) <= 1 && performance.now() - stableSince > 600) break;
      }
      const all = ids();
      return { frames: frameCount, messages: all.length, firstId: Math.min(...all) };
    },

    /**
     * Scenario 8. Types `charsPerMessage` characters into the open composer and sends the message, `messages` times. A
     * character is a keydown, an `insertText` (the browser fires beforeinput / input, as for a typed key) and a keyup; its
     * input latency is the time until the frame after the one that applied it has started, i.e. until that update is on screen.
     * The send is a click on the main button.
     */
    async typeAndSend(charsPerMessage, messages, restMs) {
      const input = document.querySelector('#editable-message-text');
      const button = () => document.querySelector('.Composer .main-button');
      if (!input || !button()) return { latencies: [], sent: 0 };
      input.focus();
      const latencies = [];
      let sent = 0;
      for (let message = 0; message < messages; message++) {
        for (let char = 0; char < charsPerMessage; char++) {
          const start = performance.now();
          input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true, cancelable: true }),
          );
          document.execCommand('insertText', false, 'x');
          input.dispatchEvent(new KeyboardEvent('keyup', { key: 'x', code: 'KeyX', bubbles: true }));
          await nextFrame();
          await nextFrame();
          latencies.push(performance.now() - start);
        }
        button().click();
        sent++;
        await sleep(restMs);
      }
      return { latencies, sent };
    },

    folderTabs: () => document.querySelectorAll('.ChatFolders .TabList > [data-file-hover-open]'),

    /** Scenario 5. Clicks the folder tabs in `order`, waiting for each slide animation to end (plus a short rest). */
    async switchFolders(order, restMs) {
      const tabs = pc.folderTabs();
      for (const index of order) {
        tabs[index].click();
        await nextFrame();
        await pc.waitForTransitionEnd();
        await sleep(restMs);
      }
    },

    /**
     * Scenario 6. Starts a folder slide (a blocking animation), delivers `updateCount` new messages while it runs, and
     * reports when the animation ended, so the harness can look at the longest task AFTER that moment.
     */
    async updatesDuringAnimation(tabIndex, updateCount, firstUpdateDelayMs, updateGapMs) {
      const ids = listedChatIds();
      const updates = [];
      for (let i = 0; i < updateCount; i++) updates.push(buildMessage(ids[6 + i], `perf message ${i}`));
      const clickedAt = pc.mark('pc:anim-start');
      pc.folderTabs()[tabIndex].click();
      await sleep(firstUpdateDelayMs);
      for (const update of updates) {
        deliver(update);
        await sleep(updateGapMs);
      }
      const animationEnd = await pc.waitForTransitionEnd();
      pc.mark('pc:anim-end');
      return { clickedAt, animationEnd };
    },
  };

  window.__pc = pc;
})();
