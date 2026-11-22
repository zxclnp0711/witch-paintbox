import type { CharacterAnchor } from './anchor-store.js';
import type { ImageProvider } from './image-settings.js';
import type { SharedOutfit } from './shared-outfit-store.js';

function nameToken(name: string, key = false): string {
  const ambiguous = /[|=;#"\\[\]\r\n]/.test(name) || name.startsWith('@')
    || (key && /^(base|default)$/i.test(name));
  return ambiguous ? JSON.stringify(name) : name;
}

function field(name: string, tags: string): string {
  // Keep user-authored weights and line endings; continuation lines cannot form new sections.
  return `${name} = ${tags.replace(/\r\n|\r|\n/g, '$&  ')}`;
}

const naturalLanguageAnchorGuidance = [
  'When writing an image scene, use this catalog only to identify and reference registered characters. Do not copy the catalog or repeat an anchored character’s age, body, face, hair, or clothing in the scene prompt.',
  'For each anchored character who is visible, include exactly one reference using the exact formal name from the catalog heading, not an alias. Make the complete reference its own comma-delimited item, for example: the healer, @CharacterName, grips his cloak. Do not attach a verb, article, or other words to the reference. To select one listed outfit, the complete item is @CharacterName:OutfitName. Place the role before the reference and that same person’s action immediately after it so the reference identifies the actor performing the action.',
  'Count every visible person and creature. State the exact count positively, assign each individual one unambiguous screen position, one still-frame pose, and any held or touched prop. Attribute each action and object to one person; do not combine sequential actions or reuse one person as a second generic character. Use “two-shot” only for exactly two visible characters; for three or more, enumerate the actual cast and positions instead.',
  'Describe the requested framing, positions, pose, interaction, expression, environment, and lighting in one coherent English scene prompt. Prefer explicit positive descriptions of who is present over negative exclusions. Do not add rendering-medium or art-style labels, quality tags, BREAK, NAI syntax, or LoRA syntax; the selected image workflow controls style.',
  'These rules constrain only image-scene content. Preserve the active response contract exactly, including any required JSON fields, insertion-point identifiers, size field, and tool-call format. Put the scene description only in the requested prompt field; do not replace structured output with prose or add unrelated explanation.',
].join('\n\n');

/** Return only user-authored anchor data; provider-specific guidance is added separately. */
export function formatAnchorCatalog(anchors: readonly CharacterAnchor[], sharedOutfits: readonly SharedOutfit[]): string {
  const sections = anchors.map(anchor => {
    const selected = anchor.outfits.find(outfit => outfit.id === anchor.selectedOutfitId);
    return [
      `[${[anchor.name, ...anchor.aliases].map(name => nameToken(name)).join(' | ')}]`,
      field('base', anchor.appearance),
      field('default', selected?.tags ?? ''),
      ...anchor.outfits.map(outfit => field(nameToken(outfit.name, true), outfit.tags)),
    ].join('\n');
  });
  if (sharedOutfits.length) {
    sections.push(['[@通用服装库]', ...sharedOutfits.map(outfit => field(nameToken(outfit.name, true), outfit.tags))].join('\n'));
  }
  return sections.join('\n\n');
}

/** Natural-language image channels get scene guidance; NAI keeps its tag-oriented behavior. */
export function formatAnchorContext(anchors: readonly CharacterAnchor[], sharedOutfits: readonly SharedOutfit[], provider: ImageProvider): string {
  const catalog = formatAnchorCatalog(anchors, sharedOutfits);
  if (!catalog) return '';
  return provider === 'novelai' ? catalog : `${naturalLanguageAnchorGuidance}\n\n${catalog}`;
}
