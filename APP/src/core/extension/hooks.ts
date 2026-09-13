import { useMemo } from 'react'
import { createExtensionWriters } from './writers'

/** React 组件内获取延伸写端口 */
export function useExtensionWriters() {
  return useMemo(() => createExtensionWriters(), [])
}
