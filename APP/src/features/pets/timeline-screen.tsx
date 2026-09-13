import React from 'react'
import { TimelineScreen } from '../timeline/screen'

/** Pet-scoped timeline reuses the main Timeline UX (EventCard, composer, grouping). */
export function PetTimelineScreen({ petId }: { petId: string }) {
  return <TimelineScreen petId={petId} />
}
