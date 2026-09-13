import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { planetApi, type DeletedFamily } from '../../core/api/planet-api';
import { errorMessage } from '../../core/api/errors';
import { invalidateAfterFamilyChange } from '../../core/foundation';
import { queryKeys } from '../../core/query/keys';
import { useToast } from '../../core/providers/toast-provider';
import { AppText } from '../../ui/components/app-text';
import { BackHeader } from '../../ui/components/back-header';
import { Button } from '../../ui/components/button';
import { Card } from '../../ui/components/card';
import { EmptyState } from '../../ui/components/empty-state';
import { LoadingState } from '../../ui/components/loading-state';
import { QueryErrorState } from '../../ui/components/query-error-state';
import { Screen } from '../../ui/components/screen';
import { FadeInView } from '../../ui/motion';

export function DeletedFamiliesScreen() {
  const { showToast } = useToast();
  const client = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.deletedFamilies,
    queryFn: () => planetApi.families.deleted(),
  });

  async function restore(family: DeletedFamily) {
    setBusyId(family.id);
    try {
      await planetApi.families.restore(family.id);
      await query.refetch();
      invalidateAfterFamilyChange(client);
      showToast({ message: `已恢复「${family.name}」。` });
    } catch (e) {
      showToast({ message: errorMessage(e) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <BackHeader
        title="已删除的家庭"
        fallbackHref="/settings"
        eyebrow="保护期恢复"
        subtitle="保护期结束前，可以恢复误删的家庭和相关记录。"
      />

      {query.isLoading ? (
        <LoadingState label="正在加载已删除的家庭" />
      ) : query.error ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (query.data?.families ?? []).length === 0 ? (
        <EmptyState title="没有可恢复的家庭" description="保护期内删除的家庭会出现在这里。" />
      ) : (
        <View style={{ gap: 12 }}>
          {(query.data?.families ?? []).map((family, index) => (
            <FadeInView key={family.id} index={index}>
            <Card style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="heading">{family.name}</AppText>
                <AppText variant="caption" muted>
                  删除于 {new Date(family.deleted_at).toLocaleString('zh-CN')}
                </AppText>
              </View>
              <Button
                label="恢复"
                busy={busyId === family.id}
                disabled={busyId !== null && busyId !== family.id}
                onPress={() => void restore(family)}
              />
            </Card>
            </FadeInView>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
