import { prettyHotkey } from '@shared/format'
import { DrawerIcon, GearIcon, MinusIcon, PinIcon } from './icons'

interface Props {
  pinned: boolean
  total: number
  hotkey: string | null
  onTogglePin: () => void
  onOpenSettings: () => void
  onHide: () => void
}

export function TitleBar({ pinned, total, hotkey, onTogglePin, onOpenSettings, onHide }: Props) {
  return (
    <header className="titlebar">
      <DrawerIcon className="titlebar__mark" />
      <div className="titlebar__text">
        <span className="titlebar__name">收纳盒</span>
        <span className="titlebar__hint">
          {total > 0 ? `${total} 项` : '还空着'}
          {hotkey ? ` · ${prettyHotkey(hotkey)} 呼出` : ''}
        </span>
      </div>
      <div className="titlebar__actions">
        <button
          type="button"
          className={`icon-btn ${pinned ? 'is-on' : ''}`}
          onClick={onTogglePin}
          title={pinned ? '取消始终置顶' : '始终置顶'}
        >
          <PinIcon />
        </button>
        <button type="button" className="icon-btn" onClick={onOpenSettings} title="设置">
          <GearIcon />
        </button>
        <button type="button" className="icon-btn" onClick={onHide} title="收到托盘（Esc）">
          <MinusIcon />
        </button>
      </div>
    </header>
  )
}
