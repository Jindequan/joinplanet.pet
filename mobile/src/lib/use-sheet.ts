/**
 * 按需挂载的 BottomSheetModal 控制器。
 *
 * 根因修复（2026-08-19）：@gorhom/bottom-sheet v5 在 react-native-web 上，
 * 模态关闭后其全屏容器会残留并拦截指针——页面在关面板后整体"冻结"
 * （Tab/按钮全部点不动，直到刷新）。与其对抗库内部动画，关闭即卸载：
 * 容器从 DOM 移除，残留层不存在。native 行为不变。
 *
 * 用法：
 *   const sheet = useSheetModal();
 *   <Pressable onPress={sheet.present}>…</Pressable>
 *   {sheet.mounted && (
 *     <BottomSheetModal ref={sheet.ref} onDismiss={sheet.onDismiss} …>
 *       <Content onClose={sheet.dismiss} />
 *     </BottomSheetModal>
 *   )}
 */
import { useEffect, useRef, useState } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

export interface SheetModalController {
  ref: React.RefObject<BottomSheetModal | null>;
  /** true 时渲染 <BottomSheetModal>；false 时从 DOM 卸载 */
  mounted: boolean;
  /** 打开（挂载后自动 present） */
  present: () => void;
  /** 代码路径关闭（内容里 onClose 用这个） */
  dismiss: () => void;
  /** 交给 <BottomSheetModal onDismiss>——用户手势关闭（背景点击/下滑）时卸载 */
  onDismiss: () => void;
}

export function useSheetModal(): SheetModalController {
  const ref = useRef<BottomSheetModal>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    // 挂载后下一帧 present，确保容器已在 DOM（react-native-web 需要）
    const id = requestAnimationFrame(() => ref.current?.present());
    return () => cancelAnimationFrame(id);
  }, [mounted]);

  return {
    ref,
    mounted,
    present: () => setMounted(true),
    dismiss: () => ref.current?.close(),
    onDismiss: () => setMounted(false),
  };
}
