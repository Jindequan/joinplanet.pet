type UserLike = {
  display_name?: string | null;
  email?: string | null;
};

/**
 * The API gives a new account an email-derived display name so the account is
 * never nameless. That value is useful for identity, but it is not a human
 * name and should not leak into the product's primary surfaces.
 */
export function humanDisplayName(user?: UserLike | null): string | undefined {
  const displayName = user?.display_name?.trim();
  const emailLocalPart = user?.email?.split('@')[0]?.trim();
  if (!displayName || displayName === emailLocalPart) return undefined;
  return displayName;
}

export function actorLabel(actorId: string | undefined, viewerId: string | undefined, actorName?: string | null): string {
  if (actorId && actorId === viewerId) return 'You';
  const name = actorName?.trim();
  return name && !name.includes('@') ? name : 'A caregiver';
}

export function pluralLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
