import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArchive, summarizeArchive } from '../dist/config-archive.js';
import { defaultImportModes, importSections, mergeArchive } from '../dist/config-merge.js';

function character(name, appearance, id = name, aliases = []) {
  return {
    id, name, aliases, appearance, negative: '',
    outfits: [{ id: `${id}-outfit`, name: '标准服装', tags: 'linen robe' }],
    selectedOutfitId: `${id}-outfit`, portrait: null, updatedAt: 1,
  };
}

function archive(anchors) {
  return parseArchive(JSON.stringify({
    format: 'witch-paintbox-config', version: 2, kind: 'anchors',
    exportedAt: '2026-11-22T00:00:00.000Z', includesKeys: false,
    data: { anchors },
  }));
}

function local(anchors) {
  return { image: {}, model: {}, preferences: {}, anchors, sharedOutfits: [], worldbooks: [] };
}

test('role-only archive validates and previews only role data', () => {
  const parsed = archive([character('护理长', 'short brown hair')]);
  assert.equal(parsed.kind, 'anchors');
  assert.deepEqual(importSections(parsed), ['anchors']);
  assert.deepEqual(defaultImportModes(parsed), { anchors: 'skip' });
  assert.match(summarizeArchive(parsed)[0].detail, /1 个角色/);
  assert.throws(() => archive([character('薇拉', 'short hair', 'one'), character('莎莉', 'long hair', 'two', ['薇拉'])]), /冲突/);
  assert.throws(() => parseArchive(JSON.stringify({
    format: 'witch-paintbox-config', version: 1, kind: 'anchors',
    exportedAt: '2026-11-22T00:00:00.000Z', includesKeys: false,
    data: { anchors: [] },
  })), /版本 2/);
});

test('role-only merge skips same names by default and adds missing characters', () => {
  const saved = character('护理长', 'local appearance', 'local-nurse');
  const input = archive([
    character('护理长', 'incoming appearance', 'file-nurse'),
    character('莎莉', 'long grey hair', 'file-sally'),
  ]);
  const result = mergeArchive(input, local([saved]), defaultImportModes(input));
  assert.deepEqual(result.stores, ['anchors']);
  assert.equal(result.config.anchors.length, 2);
  assert.equal(result.config.anchors[0].appearance, 'local appearance');
  assert.equal(result.config.anchors[1].name, '莎莉');
  assert.match(result.details.get('anchors'), /新增 1/);
  assert.match(result.details.get('anchors'), /跳过同名 1/);
});

test('role-only overwrite preserves local ID and portrait while leaving other sections untouched', () => {
  const saved = { ...character('护理长', 'local appearance', 'local-nurse'), portrait: new Blob(['portrait']) };
  const input = archive([character('护理长', 'incoming appearance', 'file-nurse')]);
  const before = { image: { sentinel: 'image' }, model: { sentinel: 'model' }, preferences: { sentinel: 'preferences' } };
  const result = mergeArchive(input, { ...local([saved]), ...before }, { anchors: 'overwrite' });
  assert.equal(result.config.anchors.length, 1);
  assert.equal(result.config.anchors[0].id, 'local-nurse');
  assert.equal(result.config.anchors[0].appearance, 'incoming appearance');
  assert.equal(result.config.anchors[0].portrait, saved.portrait);
  assert.deepEqual(result.config.image, before.image);
  assert.deepEqual(result.config.model, before.model);
  assert.deepEqual(result.config.preferences, before.preferences);
  assert.deepEqual(result.stores, ['anchors']);
  assert.match(result.details.get('anchors'), /覆盖同名 1/);
});

test('role-only summaries report portraits and all-conflict previews are not described as empty', () => {
  const portrait = 'data:image/png;base64,iVBORw0KGgo=';
  const incoming = { ...character('薇拉', 'short hair'), portrait };
  assert.match(summarizeArchive(archive([incoming]))[0].detail, /1 张角色图/);
  const conflicting = archive([character('薇拉', 'short hair', 'file-vira', ['护理长'])]);
  const existing = character('护理长', 'long hair', 'local-nurse');
  const result = mergeArchive(conflicting, local([existing]), defaultImportModes(conflicting));
  assert.equal(result.config.anchors.length, 1);
  assert.match(result.details.get('anchors'), /没有可导入角色/);
  assert.doesNotMatch(result.details.get('anchors'), /文件中没有条目/);
});

test('role-only merges cannot exceed the role-library import limit', () => {
  const existing = Array.from({ length: 10_000 }, (_, index) => character(`角色${index}`, 'appearance', `id-${index}`));
  const input = archive([character('额外角色', 'appearance', 'extra')]);
  assert.throws(() => mergeArchive(input, local(existing), { anchors: 'overwrite' }), /超过 10000 个角色/);
});
