import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFoundationWriters } from './writers'

/** React 组件内获取地基写端口（带 QueryClient 绑定） */
export function useFoundationWriters() {
  const client = useQueryClient()
  return useMemo(() => createFoundationWriters(client), [client])
}
