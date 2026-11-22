import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the native current-round panel renders saved images and follows floor changes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const listeners = new Map();
  const save = { id: 'test-save', volume: null, name: 'Test' };
  const scope = JSON.stringify(['character', 'test.png']);
  const chatId = JSON.stringify(['sifang', save.id, save.volume]);
  const floor = (index, summary) => ({
    saveId: save.id, volume: save.volume, floor: index, node: `node-${index}`, role: 'assistant',
    raw: `正文\n<img>\n[${summary}]\nblue eyes\n</img>`, busy: false, version: 1,
  });
  const floors = [floor(0, '第一幅画')];
  let readLatest;
  globalThis.Sifang = {
    apiVersion: 1, capabilities: ['native-game', 'native-events', 'native-text-write', 'native-image-markers'],
    game: {
      save: async () => save, floors: async () => floors,
      floor: async index => index === undefined ? readLatest?.() ?? floors.at(-1) : floors[index],
      replaceText: async () => { throw new Error('a read must not write the floor'); },
    },
    ui: { imageMarkers() {}, imageMarker() {} },
    on(event, handler) { listeners.set(event, handler); return () => listeners.delete(event); },
  };
  globalThis.SillyTavern = { getContext: () => ({ characterId: 0, characters: [{ name: 'Test', avatar: 'test.png' }] }) };
  const { markerEntries } = await import('../dist/image-marker-history.js');
  const { initializeSifangChat } = await import('../dist/sifang-chat.js');
  const { AnchorConfig } = await import('../dist/anchor-config.js');
  const records = new Map();
  for (const message of [floors[0], floor(1, '第二幅画')]) {
    const [{ historyKey }] = markerEntries({ scope, chatId, messageId: message.floor,
      swipeId: 0, historyId: message.node, turnId: message.node, text: message.raw });
    records.set(historyKey, [{
      id: message.node, markerKey: historyKey, createdAt: message.floor, blob: new Blob(['image fixture']),
      positive: 'blue eyes', negative: '', seed: 42, parameters: { model: 'test', sampler: 'test',
        noiseSchedule: 'test', sm: false, smDyn: false, width: 512, height: 512, steps: 20, scale: 5, cfgRescale: 0 },
    }]);
  }
  globalThis.window = Object.assign(new EventTarget(), {
    localStorage: { getItem: () => null },
    indexedDB: {
      open(name) {
        const request = { result: {
          transaction() {
            const tx = { objectStore: () => ({
              getAll: () => ({ result: [] }),
              index: () => ({ getAll: key => ({ result: records.get(key) ?? [] }) }),
            }) };
            queueMicrotask(() => tx.oncomplete());
            return tx;
          },
        } };
        assert.match(name, /^witch-paintbox-/);
        queueMicrotask(() => request.onsuccess());
        return request;
      },
    },
  });
  const lifecycle = new AbortController();
  const view = new AnchorConfig();
  const container = Object.assign(new EventTarget(), { innerHTML: '', querySelector: () => null });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  t.after(() => { view.unmount(); lifecycle.abort(); });
  await initializeSifangChat(lifecycle.signal);
  view.mount(container);
  await flush();
  assert.match(container.innerHTML, /第一幅画/);
  assert.match(container.innerHTML, /blue eyes/);
  assert.doesNotMatch(container.innerHTML, /正在读取本轮图片/);

  floors.push(floor(1, '第二幅画'));
  listeners.get('floor')({ floor: 1, node: floors[1].node });
  await flush();
  t.mock.timers.tick(180);
  await flush();
  assert.match(container.innerHTML, /第二幅画/);
  assert.doesNotMatch(container.innerHTML, /第一幅画/);

  const delayedRead = Promise.withResolvers();
  readLatest = () => delayedRead.promise;
  const button = new (globalThis.Element = class {
    dataset = { anchorAction: 'refresh' };
    closest(selector) { return selector === 'button' ? this : null; }
  })();
  const refreshEvent = () => {
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: button });
    container.dispatchEvent(event);
  };
  refreshEvent();
  await flush();
  t.mock.timers.tick(45_000);
  await flush();
  assert.match(container.innerHTML, /读取本轮图片超时/);
  readLatest = undefined;
  refreshEvent();
  await flush();
  assert.match(container.innerHTML, /第二幅画/);
  delayedRead.resolve(null);
  await flush();
  assert.match(container.innerHTML, /第二幅画/);
  assert.doesNotMatch(container.innerHTML, /读取本轮图片超时/);
});
