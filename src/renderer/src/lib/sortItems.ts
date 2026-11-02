import type { ItemSort, ItemView } from '@shared/types'
import { initialsOf } from './initials'

/**
 * 分组内的二次排序。
 *
 * 主进程已经按「固定在前 → 手动位次 → 加入时间倒序」给了一遍顺序，
 * 这里只在用户选了别的排法时重排。固定项在任何排法下都留在最前 ——
 * 「钉住」这个动作的含义就是「别把它挪走」，被排序方式推翻等于没钉。
 */
export function sortItems(items: ItemView[], sortBy: ItemSort): ItemView[] {
  if (sortBy === 'custom') return items

  const next = [...items]
  next.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1

    if (sortBy === 'name') {
      // 中文按拼音字母序，英文按原样；比较键用首字母串 + 原串兜底，
      // 免得「微信」和「WPS」这种同首字母的项比出个随机顺序
      const keyA = `${initialsOf(a.title)} ${a.title.toLowerCase()}`
      const keyB = `${initialsOf(b.title)} ${b.title.toLowerCase()}`
      const cmp = keyA.localeCompare(keyB, 'zh-Hans-CN')
      if (cmp !== 0) return cmp
      return b.createdAt - a.createdAt
    }

    if (sortBy === 'opened') {
      // 从没打开过的排在后面，否则它们会以 lastOpenedAt = 0 全都挤到最前
      if (a.lastOpenedAt !== b.lastOpenedAt) return b.lastOpenedAt - a.lastOpenedAt
      return b.createdAt - a.createdAt
    }

    // recent：保持主进程给的顺序即可（已是加入时间倒序）
    return b.createdAt - a.createdAt
  })
  return next
}
