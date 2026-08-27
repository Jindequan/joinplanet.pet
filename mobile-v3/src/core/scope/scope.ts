export type Scope =
  | { type: "all" }
  | { type: "family"; id: string }
  | { type: "pet"; id: string };

export function scopeLabel(
  scope: Scope,
  families: Array<{ id: string; name: string }>,
  pets: Array<{ id: string; name: string }>,
) {
  if (scope.type === "all") return "全部宠物";
  if (scope.type === "family")
    return families.find((family) => family.id === scope.id)?.name ?? "家庭";
  return pets.find((pet) => pet.id === scope.id)?.name ?? "宠物";
}
