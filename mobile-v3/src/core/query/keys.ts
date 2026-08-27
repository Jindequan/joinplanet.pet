export const queryKeys = {
  me: () => ["me"] as const,
  usage: () => ["usage"] as const,
  preferences: () => ["preferences"] as const,
  families: () => ["families"] as const,
  family: (id: string) => ["family", id] as const,
  deletedFamilies: () => ["families", "deleted"] as const,
  pets: (includeArchived = false) => ["pets", { includeArchived }] as const,
  pet: (id: string) => ["pet", id] as const,
  carePlans: (id: string, includeArchived = false) =>
    ["care-plans", id, { includeArchived }] as const,
  today: (scope: { familyId?: string; petId?: string; date: string }) =>
    ["today", scope] as const,
  timeline: (scope: { petId: string; before?: string; beforeId?: string }) =>
    ["timeline", scope] as const,
  medications: (id: string) => ["medications", id] as const,
  shares: (id: string) => ["shares", id] as const,
  transfers: (id: string, direction: string) =>
    ["transfers", id, direction] as const,
  notificationPrefs: (id: string) => ["notification-prefs", id] as const,
  digest: (id: string, date: string) => ["digest", id, date] as const,
  alerts: (id: string) => ["alerts", id] as const,
};
