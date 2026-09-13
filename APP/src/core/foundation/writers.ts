/**
 * 地基写操作 — 封装 planetApi + 统一 invalidate + 幂等键。
 */
import type { QueryClient } from '@tanstack/react-query'
import { createIdempotencyKey, planetApi } from '../api/planet-api'
import type {
  FoundationCompleteCareInput,
  FoundationScheduleActionInput,
  FoundationUpdateEventInput,
  FoundationWriteEventInput,
  FoundationWriters,
} from './contracts'
import {
  invalidateAfterCareAction,
  invalidateAfterScheduleChange,
  invalidateAfterTimelineChange,
} from './cache'

export function createFoundationWriters(client: QueryClient): FoundationWriters {
  return {
    async completeCare(input: FoundationCompleteCareInput) {
      const result = await planetApi.tasks.complete(
        input.taskId,
        { status: input.status, date: input.date, note: input.note },
        input.idempotencyKey,
      )
      invalidateAfterCareAction(client)
      return result
    },

    async undoCare(logId: string, idempotencyKey?: string) {
      await planetApi.tasks.undo(logId, idempotencyKey)
      invalidateAfterCareAction(client)
    },

    async applyScheduleAction(input: FoundationScheduleActionInput) {
      const result = await planetApi.schedule.applyAction(
        {
          action: input.action,
          scope: input.scope,
          slot: input.slot,
          payload: input.payload,
        },
        input.idempotencyKey,
      )
      invalidateAfterScheduleChange(client, input.petId)
      return result
    },

    async writeTimelineEvent(input: FoundationWriteEventInput) {
      const result = await planetApi.pets.createEvent(
        input.petId,
        {
          ...(input.familyId ? { family_id: input.familyId } : {}),
          type: input.type,
          occurred_at: input.occurred_at,
          payload: input.payload,
        },
        input.idempotencyKey ?? createIdempotencyKey(),
      )
      invalidateAfterTimelineChange(client, input.petId)
      return result.event
    },

    async updateTimelineEvent(input: FoundationUpdateEventInput) {
      const result = await planetApi.timeline.update(input.eventId, {
        occurred_at: input.occurred_at,
        payload: input.payload,
      })
      invalidateAfterTimelineChange(client, input.petId)
      return result.event
    },

    async deleteTimelineEvent(eventId: string, petId?: string) {
      await planetApi.timeline.delete(eventId)
      invalidateAfterTimelineChange(client, petId)
    },
  }
}
