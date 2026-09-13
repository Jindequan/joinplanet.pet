/**
 * L3–L4 延伸层写端口 — 分享/授权/接力元数据；不写入平行待办或 Event 表（note 经后端地基口）。
 */
import { planetApi } from '../api/planet-api'
import type { ExtensionWriters } from './contracts'

export function createExtensionWriters(): ExtensionWriters {
  return {
    async createShare(input) {
      return planetApi.pets.createShare(
        input.petId,
        {
          kind: input.kind,
          ttl_hours: input.ttlHours,
          options: input.options,
        },
        input.idempotencyKey,
      )
    },
    revokeShare(shareId) {
      return planetApi.shares.revoke(shareId)
    },
    async grantAccess(input) {
      await planetApi.pets.grantAccess(input.petId, {
        user_id: input.userId,
        role: input.role,
        expires_at: input.expiresAt,
      })
    },
    revokeAccess(petId, grantId) {
      return planetApi.pets.revokeAccess(petId, grantId)
    },
    async claimHandoff(input) {
      const result = await planetApi.handoffs.claim(
        input.petId,
        { note: input.note },
        input.idempotencyKey,
      )
      return result.handoff
    },
    releaseHandoff(petId, note, idempotencyKey) {
      return planetApi.handoffs.release(petId, { note }, idempotencyKey)
    },
  }
}

export const extensionWriters = createExtensionWriters()
