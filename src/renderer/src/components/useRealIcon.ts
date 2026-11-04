import { useEffect, useState } from 'react'
import { hasRealIcon } from '@shared/icons'
import type { ItemView } from '@shared/types'

/**
 * 快捷方式 / 可执行文件的「系统原图标」。
 *
 * 主进程那边有缓存，这里再加一层模块级缓存：卡片会随搜索、分组切换反复重挂载，
 * 没有这层的话每切一次分组就发一轮 IPC。缓存到进程结束，文件换了图标要重启才更新。
 */
const cache = new Map<string, string | null>()

/** 同一 target 的请求只发一次：卡片重挂载时别把还没回来的请求再发一遍 */
const pending = new Map<string, Promise<string | null>>()

/** 只有这几类文件值得去问系统要图标，其余用自绘矢量图（见 shared/icons.ts） */
function wants(item: ItemView): boolean {
  if (!item.exists) return false
  // 指向文件夹的快捷方式：系统图标就是那套黄蓝文件夹，直接用矢量文件夹
  if (item.linkDir) return false
  if (item.kind !== 'file' && item.kind !== 'folder') return false
  return hasRealIcon(item.ext)
}

function load(id: string, target: string): Promise<string | null> {
  const inflight = pending.get(target)
  if (inflight) return inflight

  const task = window.deskbox
    .getItemIcon(id)
    .then((value) => {
      cache.set(target, value)
      return value
    })
    .catch(() => {
      // 取不到就记成 null，别每次重渲染再问一遍
      cache.set(target, null)
      return null
    })
    .finally(() => {
      pending.delete(target)
    })

  pending.set(target, task)
  return task
}

export interface RealIcon {
  url: string | null
  /** 正在向主进程要图标：卡片先画占位骨架，别让用户对着通用图标干等 */
  loading: boolean
}

export function useRealIcon(item: ItemView): RealIcon {
  const wanted = wants(item)
  const [url, setUrl] = useState<string | null>(() =>
    wanted ? (cache.get(item.target) ?? null) : null
  )
  const [loading, setLoading] = useState<boolean>(() => wanted && !cache.has(item.target))

  useEffect(() => {
    if (!wanted) {
      setUrl(null)
      setLoading(false)
      return undefined
    }

    if (cache.has(item.target)) {
      setUrl(cache.get(item.target) ?? null)
      setLoading(false)
      return undefined
    }

    let alive = true
    setUrl(null)
    setLoading(true)
    void load(item.id, item.target).then((value) => {
      if (!alive) return
      setUrl(value)
      setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [item.id, item.target, wanted])

  return { url, loading }
}
