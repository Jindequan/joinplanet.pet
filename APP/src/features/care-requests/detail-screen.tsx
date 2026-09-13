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
import { CareRequestInbox } from './panel'

export function CareRequestDetailScreen({ requestId }: { requestId: string }) {
  const { userId: sessionUserId } = useSession()
  const { setScope } = useScope()
  const request = useQuery({
    queryKey: ['care-requests', 'request', requestId],
    queryFn: () => planetApi.careRequests.get(requestId),
    enabled: Boolean(requestId),
    refetchInterval: 8_000,
  })

  useEffect(() => {
    const careRequest = request.data?.care_request
    if (careRequest?.family_id && careRequest.pet_id) {
      setScope({ type: 'pet', id: careRequest.pet_id, familyId: careRequest.family_id })
    } else if (careRequest?.family_id) {
      setScope({ type: 'family', id: careRequest.family_id })
    }
  }, [request.data?.care_request, setScope])

  if (request.isLoading) {
    return (
      <Screen>
        <BackHeader title="照护请求" fallbackHref="/requests" />
        <LoadingState label="正在加载照护请求" />
      </Screen>
    )
  }

  if (request.isError) {
    return (
      <Screen>
        <BackHeader title="照护请求" fallbackHref="/requests" />
        <QueryErrorState
          error={request.error}
          message={
            isApiError(request.error) && (request.error.status === 400 || request.error.status === 404)
              ? '这条照护请求不存在，或你已无权查看。'
              : undefined
          }
          onRetry={() => void request.refetch()}
        />
      </Screen>
    )
  }

  if (!request.data?.care_request) {
    return (
      <Screen>
        <BackHeader title="照护请求" fallbackHref="/requests" />
        <EmptyState title="请求不存在" description="这条请求可能已过期、被撤回，或你已无权查看。" />
      </Screen>
    )
  }

  return (
    <Screen>
      <BackHeader title="照护请求" fallbackHref="/requests" />
      <CareRequestInbox
        currentUserId={sessionUserId ?? 'anonymous'}
        requestId={requestId}
        detailOnly
      />
    </Screen>
  )
}
