import type { ItemView } from '@shared/types'
import { hostOf } from '@shared/url'
import { INTERNAL_ITEM_TYPE } from '../lib/dnd'
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
  /** 整理模式：卡片可以拖拽排序 */
  arranging: boolean
  /** 正在被拖动的那张卡 */
  dragging: boolean
  /** Ctrl/Shift 点击多选。普通单击不再选中：单选走右键菜单 */
  onSelect: (event: React.MouseEvent) => void
  onOpen: () => void
  /** 片段（text）双击时触发：弹窗预览全文 */
  onPreview: () => void
  onMenu: () => void
  onDragBegin: () => void
  onDragEnd: () => void
  /** 整理模式下的拖拽排序回调 */
  onArrangeStart: () => void
  onArrangeHover: () => void
  onArrangeEnd: () => void
}

export function ItemCard({
  item,
  selected,
  arranging,
  dragging,
  onSelect,
  onOpen,
  onPreview,
  onMenu,
  onDragBegin,
  onDragEnd,
  onArrangeStart,
  onArrangeHover,
  onArrangeEnd
}: Props) {
  // 整理模式下固定项也不能拖：它们恒在最前，拖了只会被拉回原位，
  // 让用户以为拖拽坏了；其余卡片都能拖（排序跟文件类型无关）
  const canExport = item.kind === 'file' || item.kind === 'folder'
  const draggable = arranging ? !item.pinned : canExport
  // 快捷方式 / 可执行文件显示系统原图标；拿不到就退回自绘矢量图
  const { url: realIcon, loading: iconLoading } = useRealIcon(item)

  return (
    <button
      type="button"
      className={[
        'tile',
        selected ? 'is-selected' : '',
        item.exists ? '' : 'is-missing',
        item.pinned ? 'is-pinned' : '',
        arranging ? 'is-arranging' : '',
        dragging ? 'is-dragging' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={draggable}
      onClick={onSelect}
      onDoubleClick={arranging ? undefined : item.kind === 'text' ? onPreview : onOpen}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu()
      }}
      onDragStart={(event) => {
        if (arranging) {
          if (item.pinned) {
            // 固定项不参与排序，别让它进拖拽态
            event.preventDefault()
            return
          }
          // 排序拖拽走 HTML5 原生 DnD：这里必须显式允许，否则 dragover 不触发
          event.dataTransfer.effectAllowed = 'move'
          // 自定义 MIME 标记内部排序，App 据此拦住 shell 的「拖东西进来」处理；
          // 同时补一份 text/plain，部分平台不 setData 就不认这是一次有效拖拽
          event.dataTransfer.setData(INTERNAL_ITEM_TYPE, item.id)
          event.dataTransfer.setData('text/plain', item.id)
          onArrangeStart()
          return
        }
        // 交给主进程的 startDrag 做原生拖拽，HTML5 的那套在这里会把文件变成文本
        event.preventDefault()
        if (!canExport || !item.exists) return
        onDragBegin()
        window.deskbox.startDrag(item.id)
      }}
      onDragOver={(event) => {
        if (!arranging) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onArrangeHover()
      }}
      onDragEnd={() => {
        if (arranging) {
          onArrangeEnd()
          return
        }
        onDragEnd()
      }}
      title={
        arranging
          ? item.pinned
            ? `${item.title}\n已固定，不参与排序`
            : `${item.title}\n拖拽调整顺序`
          : `${item.title}\n${item.target}\n\n${item.kind === 'text' ? '双击预览' : '双击打开'} · 右键更多 · Ctrl/Shift 点击多选`
      }
    >
      <span className="tile__visual">
        {realIcon ? (
          <img className="glyph-img" src={realIcon} alt="" draggable={false} />
        ) : iconLoading ? (
          <span className="glyph-loading" aria-hidden="true" />
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
