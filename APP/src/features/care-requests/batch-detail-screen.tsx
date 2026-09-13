import React, { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { planetApi } from '../../core/api/planet-api'
import { isApiError } from '../../core/api/errors'
import { useSession } from '../../core/providers/session-provider'
import { useScope } from '../../core/providers/scope-provider'
import { BackHeader } from '../../ui/components/back-header'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { CareHandoffBatchInbox } from './batch-panel'

export function CareHandoffBatchDetailScreen({ batchId }: { batchId: string }) {
  const { userId: sessionUserId } = useSession()
  const { setScope } = useScope()
  const batch = useQuery({
    queryKey: ['care-handoff-batches', batchId],
    queryFn: () => planetApi.careHandoffBatches.get(batchId),
    enabled: Boolean(batchId),
    refetchInterval: 8_000,
  })

  useEffect(() => {
    const familyId = batch.data?.batch?.family_id
    if (familyId) setScope({ type: 'family', id: familyId })
  }, [batch.data?.batch?.family_id, setScope])

  if (batch.isLoading) {
    return <Screen><BackHeader title="批量照护安排" fallbackHref="/requests" /><LoadingState label="正在加载批量照护安排" /></Screen>
  }
  if (batch.isError) {
    return (
      <Screen>
        <BackHeader title="批量照护安排" fallbackHref="/requests" />
        <QueryErrorState
          error={batch.error}
          message={
            isApiError(batch.error) && (batch.error.status === 400 || batch.error.status === 404)
              ? '这批照护事项不存在，或你已无权查看。'
              : undefined
          }
          onRetry={() => void batch.refetch()}
        />
      </Screen>
    )
  }
  if (!batch.data?.batch) {
    return (
      <Screen>
        <BackHeader title="批量照护安排" fallbackHref="/requests" />
        <EmptyState title="这批事项不存在" description="可能已过期、完成，或你已无权查看。" />
      </Screen>
    )
  }

  return (
    <Screen>
      <BackHeader title="批量照护安排" fallbackHref="/requests" />
      <CareHandoffBatchInbox
        currentUserId={sessionUserId ?? 'anonymous'}
        batchId={batchId}
        detailOnly
      />
    </Screen>
  )
}
