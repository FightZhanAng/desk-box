import { useEffect, useRef, useState } from 'react'
import type { ItemSort } from '@shared/types'
import { SORT_IDS, SORT_LABELS } from '@shared/defaults'
import { SortIcon } from './icons'

interface Props {
  sortBy: ItemSort
  /** 整理模式是否已开启 */
  arranging: boolean
  onChange: (sortBy: ItemSort) => void
  onToggleArrange: () => void
}

/**
 * 搜索框右侧的排序入口。
 *
 * 单独抽一个组件，是因为它自带弹出层：菜单要按按钮的实测位置定位，
 * 还要处理「点外面 / Esc 关闭」，这些跟搜索框本身无关，塞在一起只会更乱。
 */
export function SortMenu({ sortBy, arranging, onChange, onToggleArrange }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: MouseEvent): void => {
      const node = event.target as Node
      if (wrapRef.current?.contains(node) || panelRef.current?.contains(node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const anchor = wrapRef.current?.getBoundingClientRect()

  return (
    <div className="sortwrap" ref={wrapRef}>
      <button
        type="button"
        className={`sortbtn ${arranging ? 'is-on' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title={`排序：${SORT_LABELS[sortBy]}${arranging ? ' · 整理中' : ''}`}
      >
        <SortIcon />
      </button>

      {open && anchor && (
        <div
          className="ctx sortmenu"
          ref={panelRef}
          style={{ left: Math.max(6, Math.min(anchor.right - 130, window.innerWidth - 136)), top: anchor.bottom + 6 }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {SORT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`sortmenu__item ${id === sortBy ? 'is-current' : ''}`}
              onClick={() => {
                onChange(id)
                setOpen(false)
              }}
            >
              <span className="ctx__label">{SORT_LABELS[id]}</span>
              {id === sortBy && <span className="sortmenu__tick" aria-hidden="true" />}
            </button>
          ))}

          <div className="sortmenu__sep" />

          <button
            type="button"
            className={`sortmenu__item ${arranging ? 'is-current' : ''}`}
            onClick={() => {
              onToggleArrange()
              setOpen(false)
            }}
            title="进入后拖拽卡片调整顺序，退出恢复拖到资源管理器"
          >
            {/* 跟上面的排序项「手动整理」区分开：那个是「按我拖过的顺序显示」，
                这个是「现在就开始拖」 */}
            <span className="ctx__label">{arranging ? '结束拖拽整理' : '拖拽调整顺序'}</span>
            {arranging && <span className="sortmenu__tick" aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  )
}
