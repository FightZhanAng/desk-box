import { FilePlusIcon, FolderIcon, LinkIcon, TextIcon } from './icons'

interface Props {
  total: number
  visible: number
  onPickFiles: () => void
  onPickFolder: () => void
  onAddLink: () => void
  onAddText: () => void
}

export function Dock({ total, visible, onPickFiles, onPickFolder, onAddLink, onAddText }: Props) {
  return (
    <footer className="dock">
      <button type="button" className="dock-btn" onClick={onPickFiles} title="从磁盘选文件">
        <FilePlusIcon />
        文件
      </button>
      <button type="button" className="dock-btn" onClick={onPickFolder} title="从磁盘选文件夹">
        <FolderIcon />
        文件夹
      </button>
      <button type="button" className="dock-btn" onClick={onAddLink} title="收一条链接">
        <LinkIcon />
        链接
      </button>
      <button type="button" className="dock-btn" onClick={onAddText} title="存一段文字">
        <TextIcon />
        片段
      </button>
      <span className="dock__spacer" />
      <span className="dock__stat">{visible === total ? `${total}` : `${visible} / ${total}`}</span>
    </footer>
  )
}
