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

/** 只有这几类文件值得去问系统要图标，其余用自绘矢量图（见 shared/icons.ts） */
function wants(item: ItemView): boolean {
  if (!item.exists) return false
  if (item.kind !== 'file' && item.kind !== 'folder') return false
  return hasRealIcon(item.ext)
}

export function useRealIcon(item: ItemView): string | null {
  const wanted = wants(item)
  const [url, setUrl] = useState<string | null>(() =>
    wanted ? (cache.get(item.target) ?? null) : null
  )

  useEffect(() => {
    if (!wanted) {
      setUrl(null)
      return undefined
    }

    const cached = cache.get(item.target)
    if (cached !== undefined) {
      setUrl(cached)
      return undefined
    }

    let alive = true
    void window.deskbox
      .getItemIcon(item.id)
      .then((value) => {
        cache.set(item.target, value)
        if (alive) setUrl(value)
      })
      .catch(() => {
        // 取不到就记成 null，别每次重渲染再问一遍
        cache.set(item.target, null)
      })

    return () => {
      alive = false
    }
  }, [item.id, item.target, wanted])

  return url
}
