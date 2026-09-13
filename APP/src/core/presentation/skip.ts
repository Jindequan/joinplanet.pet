/** Skip / schedule-exception copy for the two-step decision flow. */

export const SKIP_COPY = {
  sheetTitle: (title: string) => `暂不处理「${title}」`,
  step1Prompt: '请选择原因（会影响是否记入时间线）',
  optionCantToday: '今天做不了',
  optionCantTodayHint: '只影响今天的循环格，不记入「已跳过」',
  optionMarkSkipped: '标记为跳过',
  optionMarkSkippedHint: '会记入时间线，成员可见',
  cancel: '取消',
  noteLabel: '备注（选填）',
} as const
