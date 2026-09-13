import type { Pet } from '../../../core/api/planet-api'

export type PetListSection = {
  key: 'active' | 'archived'
  title: string
  pets: Pet[]
}

export function partitionPetList(pets: Pet[]): PetListSection[] {
  const active = pets.filter((pet) => !pet.archived_at)
  const archived = pets.filter((pet) => pet.archived_at)
  const sections: PetListSection[] = []
  if (active.length) sections.push({ key: 'active', title: '活跃', pets: active })
  if (archived.length) sections.push({ key: 'archived', title: '已归档', pets: archived })
  return sections
}
