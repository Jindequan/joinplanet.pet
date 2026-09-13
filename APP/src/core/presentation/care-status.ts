/**
 * One status vocabulary for every Care Occurrence projection.
 *
 * The API normally returns a TaskLog for a resolved occurrence, but older
 * snapshots may only contain the occurrence status. Reading both keeps Today,
 * Pet and Family summaries from disagreeing during refresh or migration.
 */
type CareItemLike = {
  log?: { status?: string | null } | null
  task: { status?: string | null }
}

export function careItemStatus(item: CareItemLike) {
  return item.log?.status ?? item.task.status ?? 'pending'
}

export function isCareDone(item: CareItemLike) {
  const status = careItemStatus(item)
  return status === 'done' || status === 'completed'
}

export function isCareSkipped(item: CareItemLike) {
  return careItemStatus(item) === 'skipped'
}

export function isCareResolved(item: CareItemLike) {
  return isCareDone(item) || isCareSkipped(item)
}

export function isCareOpen(item: CareItemLike) {
  return !isCareResolved(item)
}
