/**
 * Trailing brand clause from brand_faction and brand_ranch.
 * Empty when both are missing or blank after trim.
 * Prints the trimmed text. Does not read `name` and does not add a [TAG] prefix.
 */
export function formatCreatureBrandSuffix(creature: Record<string, unknown>): string {
  const faction = trimmedBrandText(creature.brand_faction);
  const ranch = trimmedBrandText(creature.brand_ranch);
  if (faction && ranch) return ` - brand ${faction}, ${ranch}`;
  if (faction) return ` - brand ${faction}`;
  if (ranch) return ` - brand ${ranch}`;
  return '';
}

/** Full get_nearby / observation-snapshot line, including the brand suffix. */
export function formatCreatureLine(creature: Record<string, unknown>): string {
  const name = creature.name || creature.creature_id || creature.species || 'Unknown';
  const species = creature.species ? ` (${creature.species})` : '';
  const role = creature.role ? ` - ${creature.role}` : '';
  const hull =
    creature.hull !== undefined || creature.max_hull !== undefined
      ? ` - hull ${creature.hull ?? '?'}/${creature.max_hull ?? '?'}`
      : '';
  const combat = creature.in_combat ? ' - in combat' : '';
  const id = creature.creature_id && creature.creature_id !== name ? ` [${creature.creature_id}]` : '';
  return `${name}${id}${species}${role}${hull}${combat}${formatCreatureBrandSuffix(creature)}`;
}

function trimmedBrandText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
}
