export type Scope =
  | { type: 'all' }
  | { type: 'family'; id: string }
  | { type: 'pet'; id: string; familyId?: string };

export function scopeLabel(
  scope: Scope,
  families: Array<{ id: string; name: string }>,
  pets: Array<{ id: string; name: string }>,
) {
  if (scope.type === 'all') return '全部宠物';
  if (scope.type === 'family')
    return families.find((family) => family.id === scope.id)?.name ?? '家庭';
  return pets.find((pet) => pet.id === scope.id)?.name ?? '宠物';
}

export function scopeStorageKey(scope: Scope): string {
  if (scope.type === 'all') return 'all';
  return `${scope.type}:${scope.id}${scope.type === 'pet' && scope.familyId ? `:${scope.familyId}` : ''}`;
}

/** Show All/Family/Pet chips only when there is something to filter. */
export function scopeFilterNeeded(
  families: Array<{ id: string }>,
  activePets: Array<{ id: string }>,
): boolean {
  return families.length > 1 || activePets.length > 1;
}
