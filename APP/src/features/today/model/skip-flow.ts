export type SkipChoice = 'cancel_occurrence' | 'mark_skipped'

export type SkipFlowStep = 'choose' | 'note'

export function skipChoiceForRecurring(recurring: boolean): SkipChoice[] {
  if (recurring) return ['cancel_occurrence', 'mark_skipped']
  return ['mark_skipped']
}

export function skipChoiceLabel(choice: SkipChoice): string {
  return choice === 'cancel_occurrence' ? '今天做不了' : '标记为跳过'
}

export function skipChoiceHint(choice: SkipChoice): string {
  return choice === 'cancel_occurrence'
    ? '只影响今天的循环格，不记入「已跳过」'
    : '会记入时间线，成员可见'
}
