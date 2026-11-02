import type { ItemView } from '@shared/types'
import { hostOf } from '@shared/url'
import { ItemGlyph } from './ItemGlyph'
import { useRealIcon } from './useRealIcon'

function metaOf(item: ItemView): string {
  if (!item.exists) return '路径失效'
  if (item.kind === 'link') return hostOf(item.target) || '链接'
  if (item.kind === 'text') return `${item.target.replace(/\s+/g, ' ').trim().length} 字`
  if (item.kind === 'folder') return '文件夹'
  if (item.linkDir) return '文件夹'
  return item.ext ? item.ext.toUpperCase() : '文件'
}

interface Props {
  item: ItemView
  selected: boolean
  /** Ctrl/Shift 点击多选。普通单击不再选中：单选走右键菜单 */
  onSelect: (event: React.MouseEvent) => void
  onOpen: () => void
  /** 片段（text）双击时触发：弹窗预览全文 */
  onPreview: () => void
  onMenu: () => void
  onDragBegin: () => void
  onDragEnd: () => void
}

export function ItemCard({
  item,
  selected,
  onSelect,
  onOpen,
  onPreview,
  onMenu,
  onDragBegin,
  onDragEnd
}: Props) {
  const draggable = item.kind === 'file' || item.kind === 'folder'
  // 快捷方式 / 可执行文件显示系统原图标；拿不到就退回自绘矢量图
  const realIcon = useRealIcon(item)

  return (
    <button
      type="button"
      className={[
        'tile',
        selected ? 'is-selected' : '',
        item.exists ? '' : 'is-missing',
        item.pinned ? 'is-pinned' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={draggable}
      onClick={onSelect}
      onDoubleClick={item.kind === 'text' ? onPreview : onOpen}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu()
      }}
      onDragStart={(event) => {
        // 交给主进程的 startDrag 做原生拖拽，HTML5 的那套在这里会把文件变成文本
        event.preventDefault()
        if (!draggable || !item.exists) return
        onDragBegin()
        window.deskbox.startDrag(item.id)
      }}
      onDragEnd={onDragEnd}
      title={`${item.title}\n${item.target}\n\n${item.kind === 'text' ? '双击预览' : '双击打开'} · 右键更多 · Ctrl/Shift 点击多选`}
    >
      <span className="tile__visual">
        {realIcon ? (
          <img className="glyph-img" src={realIcon} alt="" draggable={false} />
        ) : (
          <ItemGlyph item={item} />
        )}
      </span>
      <span className="tile__name">{item.title}</span>
      <span className="tile__meta">{metaOf(item)}</span>
      {selected && <span className="tile__check" aria-hidden="true" />}
    </button>
  )
}
