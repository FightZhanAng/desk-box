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
  onMenu: (id: string) => void
  onDragBegin: () => void
  onDragEnd: () => void
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
  onDragEnd
}: Props) {
  return (
    <div className={`grid ${compact ? 'is-compact' : ''}`}>
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          selected={selectedIds.has(item.id)}
          onSelect={(event) => onSelect(item.id, event)}
          onOpen={() => onOpen(item.id)}
          onPreview={() => onPreview(item.id)}
          onMenu={() => onMenu(item.id)}
          onDragBegin={onDragBegin}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  )
}
