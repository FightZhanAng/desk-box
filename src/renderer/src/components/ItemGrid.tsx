import type { ItemView } from '@shared/types'
import { ItemCard } from './ItemCard'

interface Props {
  items: ItemView[]
  compact: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onMenu: (id: string) => void
  onDragBegin: () => void
  onDragEnd: () => void
}

export function ItemGrid({
  items,
  compact,
  selectedId,
  onSelect,
  onOpen,
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
          selected={selectedId === item.id}
          onSelect={() => onSelect(item.id)}
          onOpen={() => onOpen(item.id)}
          onMenu={() => onMenu(item.id)}
          onDragBegin={onDragBegin}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  )
}
