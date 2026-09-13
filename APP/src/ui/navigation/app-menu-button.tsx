import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { DotsThree, GearSix, House, TrendUp, UserCircle, X } from 'phosphor-react-native'
import { router } from 'expo-router'
import { useTheme } from '../../core/providers/theme-provider'
import { useCapabilities } from '../../core/capabilities'
import { AppText } from '../components/app-text'
import { ModalSheet } from '../components/modal-sheet'
import { MoreGroup, MoreRow } from '../components/more'
import { PressableScale } from '../motion'

export function AppMenuButton() {
  const { theme } = useTheme()
  const { caps } = useCapabilities()
  const [visible, setVisible] = useState(false)

  function go(path: string) {
    setVisible(false)
    router.push(path as never)
  }

  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="打开菜单"
        onPress={() => setVisible(true)}
        style={[styles.button, { backgroundColor: theme.colors.sageSoft, borderRadius: theme.radius.md }]}
      >
        <DotsThree size={22} color={theme.colors.forest2} weight="bold" />
      </PressableScale>
      <ModalSheet visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.heading}>
          <View style={styles.headingRow}>
            <AppText variant="heading">更多入口</AppText>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="关闭菜单"
              onPress={() => setVisible(false)}
              style={styles.close}
            >
              <X size={20} color={theme.colors.forest2} weight="bold" />
            </PressableScale>
          </View>
          <AppText variant="caption" muted>家庭管理、趋势、设置和账户信息都在这里。</AppText>
        </View>
        <MoreGroup label="管理">
          <MoreRow
            icon={<House size={19} color={theme.colors.forest2} weight="duotone" />}
            title="家庭管理"
            sub="成员、邀请、家庭和权限"
            onPress={() => go('/families')}
          />
        </MoreGroup>
        <MoreGroup label="查看">
          <MoreRow
            icon={<TrendUp size={19} color={theme.colors.forest2} weight="duotone" />}
            title="趋势"
            sub="完成率、体重和变化"
            onPress={() => go('/trends')}
          />
          <MoreRow
            icon={<GearSix size={19} color={theme.colors.forest2} weight="duotone" />}
            title="设置"
            sub={caps.push_notifications ? '通知、默认范围和已删除内容' : '默认范围和已删除内容'}
            onPress={() => go('/settings')}
          />
        </MoreGroup>
          <MoreRow
            icon={<UserCircle size={19} color={theme.colors.forest2} weight="duotone" />}
            title="账户"
            sub="个人资料和退出登录"
            onPress={() => go('/account')}
          />
      </ModalSheet>
    </>
  )
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { gap: 4, marginBottom: 4 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
