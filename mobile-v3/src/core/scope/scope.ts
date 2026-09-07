import { tt } from "../i18n";

export type Scope =
  | { type: "all" }
  | { type: "family"; id: string }
  | { type: "pet"; id: string };

export function scopeLabel(
  scope: Scope,
  families: Array<{ id: string; name: string }>,
  pets: Array<{ id: string; name: string }>,
) {
  if (scope.type === "all") return tt("全部宠物", "All pets");
  if (scope.type === "family")
    return families.find((family) => family.id === scope.id)?.name ?? tt("家庭", "Family");
  return pets.find((pet) => pet.id === scope.id)?.name ?? tt("宠物", "Pet");
}
