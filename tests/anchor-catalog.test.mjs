import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { formatAnchorCatalog, formatAnchorContext } from '../dist/anchor-catalog.js';
import { resolveAnchorPrompt } from '../dist/anchor-resolver.js';

const anchors = [{
  id: 'vera', name: '薇拉', aliases: ['护理长'], appearance: 'adult woman, short brown hair, green eyes',
  negative: '', outfits: [{ id: 'robe', name: '护理袍', tags: 'worn ivory linen robe' }],
  selectedOutfitId: 'robe', portrait: null, updatedAt: 1,
}];

test('anchor catalog contains only saved anchor data and stays empty when no roles exist', () => {
  const catalog = formatAnchorCatalog(anchors, []);
  assert.match(catalog, /^\[薇拉 \| 护理长\]/);
  assert.match(catalog, /base = adult woman, short brown hair, green eyes/);
  assert.doesNotMatch(catalog, /response contract|two-shot|rendering-medium|@<formal character name>/i);
  assert.equal(formatAnchorCatalog([], []), '');
  assert.equal(formatAnchorContext([], [], 'openai'), '');
});

test('scene guidance is scoped to natural-language providers and preserves output protocols', () => {
  for (const provider of ['openai', 'gemini', 'grok']) {
    const context = formatAnchorContext(anchors, [], provider);
    assert.match(context, /exact formal name/);
    assert.match(context, /exact count positively/);
    assert.match(context, /Preserve the active response contract exactly/);
    assert.match(context, /tool-call format/);
    assert.doesNotMatch(context, /Return only the scene prompt/);
  }
  const nai = formatAnchorContext(anchors, [], 'novelai');
  assert.match(nai, /^\[薇拉 \| 护理长\]/);
  assert.doesNotMatch(nai, /exact formal name|two-shot|tool-call format/);
});

test('a comma-delimited formal reference expands once without losing its action context', () => {
  const prompt = 'Exactly two visible people: foreground, the archer, @薇拉, kneels behind him and holds his cloak; background, one goblin crouches beside the wall.';
  const expanded = resolveAnchorPrompt(prompt, anchors);
  assert.doesNotMatch(expanded, /@薇拉/);
  assert.equal(expanded.match(/adult woman, short brown hair, green eyes/g)?.length, 1);
  assert.equal(expanded.match(/worn ivory linen robe/g)?.length, 1);
  assert.match(expanded, /the archer, adult woman, short brown hair, green eyes, worn ivory linen robe, kneels behind him and holds his cloak/);
  assert.match(expanded, /one goblin crouches beside the wall/);
});

test('all Goblin Slayer anchor packs retain the model recognition tags and helmet identity', async () => {
  const paths = [
    '../examples/witch-paintbox-anchor-pack.json',
    '../examples/witch-paintbox-goblin-slayer-role-fix.json',
    '../examples/witch-paintbox-goblin-slayer-anchor-fix.json',
  ];
  const rows = await Promise.all(paths.map(async path => {
    const archive = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
    const role = archive.data.anchors.find(anchor => anchor.name === '哥布林杀手');
    assert.ok(role);
    assert.match(role.appearance, /goblin_slayer/);
    assert.match(role.appearance, /Goblin Slayer/);
    assert.match(role.appearance, /both ears fully enclosed|entire head and ears fully enclosed/);
    assert.match(role.appearance, /three narrow vertical black visor slits/);
    assert.match(role.appearance, /pale ivory circular metal (?:temple|plate)/);
    return { appearance: role.appearance, outfit: role.outfits.find(item => item.id === role.selectedOutfitId)?.tags };
  }));
  assert.ok(rows.every(row => row.appearance === rows[0].appearance));
  assert.ok(rows.every(row => row.outfit === rows[0].outfit));
});
