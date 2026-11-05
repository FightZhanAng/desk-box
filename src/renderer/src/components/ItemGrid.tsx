import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemView } from '@shared/types'
import { ItemCard } from './ItemCard'

interface Props {
  items: ItemView[]
  compact: boolean
  selectedIds: Set<string>
  /** Ctrl/Shift 点击多选；普通单击不再选中 */
  onSelect: (id: string, event: React.MouseEvent) => void
  onOpen: (id: string) => void
  /** 片段双击预览 */
  onPreview: (id: string) => void
  onMenu: (id: string, x: number, y: number) => void
  onDragBegin: () => void
  onDragEnd: () => void
  /** 整理模式：卡片拖拽只改顺序，不再拖到资源管理器 */
  arranging: boolean
  /** 松手时提交新顺序（参与排序的 id 列表，按显示顺序） */
  onReorder: (ids: string[]) => void
}

export function ItemGrid({
  items,
  compact,
  selectedIds,
  onSelect,
  onOpen,
  onPreview,
  onMenu,
  onDragBegin,
  onDragEnd,
  arranging,
  onReorder
}: Props) {
  // 拖动中的临时顺序，只存「可拖动」的那部分（固定项恒在最前，不参与排序）。
  // 拿它当独立状态而不是直接改 props，是为了拖动过程中能实时预览，
  // 松手才落一次盘 —— 每划过一张卡片就写一次盘会卡得没法用。
  const [draft, setDraft] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  // dragstart → dragover → drop → dragend 全在同一个 tick 里同步派发完，
  // React 的状态更新还没提交，闭包里读到的 draft / dragId 永远是旧值 ——
  // 用 ref 镜像一份实时值，松手时才有东西可提交
  const draftRef = useRef<string[] | null>(null)
  const dragRef = useRef<string | null>(null)

  const writeDraft = (next: string[] | null): void => {
    draftRef.current = next
    setDraft(next)
  }
  const writeDrag = (next: string | null): void => {
    dragRef.current = next
    setDragId(next)
  }

  // 退出整理模式或外部数据变了就丢掉草稿，避免残留顺序盖住真实数据
  useEffect(() => {
    if (!arranging) {
      writeDraft(null)
      writeDrag(null)
    }
  }, [arranging])

  const displayItems = useMemo(() => {
    if (!draft) return items

    const pinned = items.filter((item) => item.pinned)
    const movable = new Map(items.filter((item) => !item.pinned).map((item) => [item.id, item]))
    const ordered = draft
      .map((id) => movable.get(id))
      .filter((item): item is ItemView => item !== undefined)

    // 草稿生成之后新加进来的条目不在草稿里，补到末尾，别让它们凭空消失
    const seen = new Set(draft)
    for (const [id, item] of movable) if (!seen.has(id)) ordered.push(item)

    return [...pinned, ...ordered]
  }, [items, draft])

  const beginDrag = (id: string): void => {
    writeDrag(id)
    writeDraft(items.filter((item) => !item.pinned).map((item) => item.id))
  }

  const hover = (id: string): void => {
    const moving = dragRef.current
    const current = draftRef.current
    if (!moving || moving === id || !current) return
    const from = current.indexOf(moving)
    const to = current.indexOf(id)
    if (from < 0 || to < 0 || from === to) return
    const next = [...current]
    next.splice(from, 1)
    next.splice(to, 0, moving)
    writeDraft(next)
  }

  const finish = (): void => {
    const next = draftRef.current
    const moved = dragRef.current
    if (next && moved) onReorder(next)
    writeDraft(null)
    writeDrag(null)
  }

  return (
    <div className={`grid ${compact ? 'is-compact' : ''} ${arranging ? 'is-arranging' : ''}`}>
      {displayItems.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          selected={selectedIds.has(item.id)}
          arranging={arranging}
          dragging={dragId === item.id}
          onSelect={(event) => onSelect(item.id, event)}
          onOpen={() => onOpen(item.id)}
          onPreview={() => onPreview(item.id)}
          onMenu={(x, y) => onMenu(item.id, x, y)}
          onDragBegin={onDragBegin}
          onDragEnd={onDragEnd}
          onArrangeStart={() => beginDrag(item.id)}
          onArrangeHover={() => hover(item.id)}
          onArrangeEnd={finish}
        />
      ))}
    </div>
  )
}
