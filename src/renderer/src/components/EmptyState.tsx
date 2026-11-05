import { EmptyDrawerIcon } from './icons'

interface Props {
  searching: boolean
  onPickFiles: () => void
  onPickFolder: () => void
  onAddLink: () => void
  onAddText: () => void
  /** 搜索无结果时的出口：清空关键词回到全量列表 */
  onClearSearch?: () => void
}

export function EmptyState({
  searching,
  onPickFiles,
  onPickFolder,
  onAddLink,
  onAddText,
  onClearSearch
}: Props) {
  if (searching) {
    return (
      <div className="empty">
        <EmptyDrawerIcon className="empty__art" />
        <span className="empty__title">没找到匹配的东西</span>
        <span className="empty__desc">换个关键词，或清空搜索框看全部。</span>
        {onClearSearch && (
          <div className="empty__quick">
            <button type="button" className="chip-btn" onClick={onClearSearch}>
              清空搜索
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="empty">
      <EmptyDrawerIcon className="empty__art" />
      <span className="empty__title">把东西直接拖进来</span>
      <span className="empty__desc">
        桌面上的文件、文件夹、浏览器里的链接、随手一段文字，拖进这个窗口就收好了。双击打开，右键还有更多操作。
      </span>
      <div className="empty__quick">
        <button type="button" className="chip-btn" onClick={onPickFiles}>
          选文件
        </button>
        <button type="button" className="chip-btn" onClick={onPickFolder}>
          选文件夹
        </button>
        <button type="button" className="chip-btn" onClick={onAddLink}>
          存链接
        </button>
        <button type="button" className="chip-btn" onClick={onAddText}>
          存片段
        </button>
      </div>
    </div>
  )
}
