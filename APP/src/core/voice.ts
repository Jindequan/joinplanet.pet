/**
 * Page-scoped copy. Each tab answers a different question — do not reuse
 * the same family/social phrasing across screens.
 */

/** Today — 今天要做什么（执行队列） */
export function todaySubtitle(
  remaining: number,
  resolved: number,
  total: number,
  featuredTitle?: string,
) {
  if (total === 0) return '暂无照护安排'
  if (remaining === 0) return `今日 ${total} 项已全部处理`
  if (remaining === 1 && featuredTitle) return `下一件：${featuredTitle}`
  return `${remaining} 项待完成 · 已完成 ${resolved}`
}

export function todayProgress(resolved: number, total: number) {
  return `${resolved}/${total}`
}

export function todayCompleteToast() {
  return '已记录完成'
}

export function todaySkipToast() {
  return '已记录跳过'
}

export function todayAssignee(name?: string, time?: string) {
  const parts = [name ? `由 ${name} 负责` : '还没有负责人', time].filter(Boolean)
  return parts.join(' · ')
}

export function todayResolvedLine(name: string | undefined, status: 'done' | 'skipped') {
  const who = name || '有人'
  return status === 'skipped' ? `${who} · 已跳过` : `${who} · 已完成`
}

/** Timeline — 发生了什么（事实流） */
export function timelinePageHint() {
  return '按时间查看照护、体重、症状和就诊记录'
}

export function timelineActorLine(name?: string) {
  if (!name || name === 'Planet 系统') return '系统生成'
  return `记录人 · ${name}`
}

export function timelineRecordToast() {
  return '已写入时间线'
}

/** Pets — 宠物工作区入口（切换与概览） */
export function petsListSubtitle(active: number, archived: number, pendingTotal = 0) {
  const parts = [`${active} 只`]
  if (pendingTotal > 0) parts.push(`${pendingTotal} 项待做`)
  if (archived) parts.push(`${archived} 只已归档`)
  return parts.join(' · ')
}

export function petRowStatus(archived: boolean, pending: number) {
  if (archived) return '已归档'
  if (pending > 0) return `${pending} 项待办`
  return ''
}

/** Pet workspace — 单宠档案与计划 */
export function petWorkspaceStatus(tasksDone: number, tasksTotal: number) {
  if (tasksTotal === 0) return '今日无照护安排'
  if (tasksDone >= tasksTotal) return `今日照护 ${tasksDone}/${tasksTotal} 已完成`
  return `今日照护 ${tasksDone}/${tasksTotal} · 尚有 ${tasksTotal - tasksDone} 项`
}

/** Trends — 长期监测（统计与趋势） */
export function trendsPageHint() {
  return '查看完成率和体重变化'
}
