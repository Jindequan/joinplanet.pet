import React from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { X } from 'phosphor-react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { Card } from './card'

type Props = React.PropsWithChildren<{
  visible: boolean
  onClose: () => void
  /** When true, backdrop press and close are ignored. */
  busy?: boolean
  contentStyle?: StyleProp<ViewStyle>
}>

/** Centered modal backdrop + card shell for forms and dialogs. */
export function ModalSheet({
  visible,
  onClose,
  busy = false,
  contentStyle,
  children,
}: Props) {
  const { theme } = useTheme()
  // RN Modal 挂在窗口层：原生宿主屏幕留栈跳走时，sheet 会盖住新页面。
  // Web 的 Tabs 场景会保留多个页面实例，useIsFocused 在这里会误报，
  // 把刚打开的 sheet 立即关闭；Web 路由卸载时 Modal 会自然消失。
  const focused = useIsFocused()
  React.useEffect(() => {
    if (Platform.OS !== 'web' && !focused && visible && !busy) onClose()
  }, [focused, visible, busy, onClose])
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose()
      }}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!busy) onClose()
          }}
          accessible={false}
          importantForAccessibility="no"
        />
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[styles.center, { maxWidth: theme.layout.contentMax }, styles.pointerEventsNone]}
          >
            <Card style={[styles.card, contentStyle]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭"
                accessibilityHint={busy ? '当前正在保存，稍后再试' : undefined}
                onPress={() => {
                  if (!busy) onClose()
                }}
                disabled={busy}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeButton,
                  { opacity: pressed ? theme.motion.pressOpacity : busy ? 0.45 : 1 },
                ]}
              >
                <X size={20} color={theme.colors.ink} weight="bold" />
              </Pressable>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {children}
              </ScrollView>
            </Card>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  keyboard: {
    flex: 1,
    justifyContent: 'center',
  },
  center: {
    width: '100%',
    alignSelf: 'center',
    zIndex: 1,
  },
  pointerEventsNone: {
    pointerEvents: 'box-none',
  },
  card: {
    width: '100%',
    maxHeight: '88%',
    padding: 0,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: '100%',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 52,
    paddingBottom: 24,
  },
})
