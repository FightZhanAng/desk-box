import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type { Group } from '@shared/types'
import { PlusIcon } from './icons'

interface Props {
  groups: Group[]
  counts: Map<string, number>
  total: number
  active: string | null
  onSelect: (id: string | null) => void
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
}

interface MenuState {
  id: string
  name: string
  x: number
  y: number
}

interface MoreState {
  x: number
  y: number
}

/**
 * 分组标签的自适应收纳。
 *
 * 窗口就那么宽，分组一多横向滚动条又藏在看不见的地方 —— 现在放不下的
 * 胶囊自动收进「更多 N」下拉。做法是全部胶囊常驻挂载，放不下的加
 * is-hidden（绝对定位 + visibility）移出排版但保留可测量性，布局效果
 * 在 useLayoutEffect 里逐个量出来，窗口缩放时 ResizeObserver 触发重算。
 */
export function GroupTabs({ groups, counts, total, active, onSelect, onAdd, onRename, onRemove }: Props) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [more, setMore] = useState<MoreState | null>(null)

  // null = 全放得下（或还没量过）；非 null = 可见集合，其余收进「更多」
  const [visibleIds, setVisibleIds] = useState<Set<string> | null>(null)
  // layoutEpoch 是状态值本身（dispatch 是稳定引用，放依赖里等于没放）：
  // ResizeObserver 触发 tick() 递增它，布局计算才会重跑
  const [layoutEpoch, tick] = useReducer((x: number) => x + 1, 0)
  const navRef = useRef<HTMLElement | null>(null)
  const moreWrapRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const pillEls = useRef(new Map<string, HTMLElement>())

  const setPillRef = (key: string) => (el: HTMLElement | null): void => {
    if (el) pillEls.current.set(key, el)
    else pillEls.current.delete(key)
  }

  const editing = editingId
  const hiddenGroups = visibleIds
    ? groups.filter((group) => !visibleIds.has(group.id) && group.id !== editing)
    : []

  /* 布局：量出每个胶囊的实宽，从左往右放，放不下的进「更多」 */
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const cs = getComputedStyle(nav)
    const avail = nav.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    if (!(avail > 0)) return
    const gap = Number.isFinite(parseFloat(cs.columnGap)) ? parseFloat(cs.columnGap) : 6
    const allW = pillEls.current.get('__all__')?.offsetWidth ?? 56
    const addW = pillEls.current.get('__add__')?.offsetWidth ?? 25
    let budget = avail - allW - addW - gap * 2

    const widthOf = (id: string): number => pillEls.current.get(id)?.offsetWidth ?? 0
    const widths = groups.map((group) => widthOf(group.id))
    const totalW = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, groups.length - 1) * gap
    if (totalW <= budget) {
      setVisibleIds(null)
      return
    }

    // 「更多」胶囊自己也要占位；还没挂载过时先按经验值预留
    budget -= (pillEls.current.get('__more__')?.offsetWidth ?? 54) + gap
    // 正在重命名的分组是 108px 定宽输入框，量不到宽度，按固定值预留
    if (editingId) budget -= 108 + gap
    const fitWidth = (list: Group[]): number =>
      list.reduce((sum, group, index) => sum + widthOf(group.id) + (index > 0 ? gap : 0), 0)

    let visible: Group[] = []
    let used = 0
    for (let index = 0; index < groups.length; index += 1) {
      const need = widths[index] + (index > 0 ? gap : 0)
      if (used + need > budget) break
      used += need
      visible = groups.slice(0, index + 1)
    }

    // 活动分组必须可见：藏在下拉里就换到前面，挤不下继续丢尾部
    const activeGroup = active ? groups.find((group) => group.id === active) : undefined
    if (activeGroup && !visible.some((group) => group.id === activeGroup.id)) {
      const rest = visible.filter((group) => group.id !== activeGroup.id)
      visible = [...rest, activeGroup]
      while (visible.length > 1 && fitWidth(visible) > budget) {
        const keep = visible.filter((group) => group.id !== activeGroup.id)
        const drop = keep[keep.length - 1]
        if (!drop) break
        visible = visible.filter((group) => group.id !== drop.id)
      }
    }

    setVisibleIds(new Set(visible.map((group) => group.id)))
  }, [groups, counts, active, editingId, layoutEpoch])

  /* 窗口宽度变化 → 重算布局 */
  useEffect(() => {
    const nav = navRef.current
    if (!nav || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => tick())
    observer.observe(nav)
    return () => observer.disconnect()
  }, [tick])

  /* 「更多」下拉：点外面 / Esc 关闭 */
  useEffect(() => {
    if (!more) return undefined
    const onDown = (event: MouseEvent): void => {
      const node = event.target as Node
      // 触发按钮和面板本体都算「里面」：面板挂在 body 级，不豁免的话
      // mousedown 一到就先关面板，click 永远落不到选项上
      if (moreWrapRef.current?.contains(node) || menuRef.current?.contains(node)) return
      setMore(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMore(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [more])

  const commitCreate = (): void => {
    const name = draft.trim()
    setCreating(false)
    setDraft('')
    if (name) onAdd(name)
  }

  const commitRename = (): void => {
    const id = editingId
    const name = editDraft.trim()
    setEditingId(null)
    setEditDraft('')
    if (id && name) onRename(id, name)
  }

  const toggleMore = (): void => {
    if (more) {
      setMore(null)
      return
    }
    const rect = moreWrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setMore({
      x: Math.max(6, Math.min(rect.left, window.innerWidth - 156)),
      y: rect.bottom + 6
    })
  }

  return (
    <>
      <nav className="groups" ref={navRef}>
        <button
          type="button"
          ref={setPillRef('__all__')}
          className={`group-pill ${active === null ? 'is-active' : ''}`}
          onClick={() => onSelect(null)}
        >
          全部
          <span className="group-pill__count">{total}</span>
        </button>

        {groups.map((group) =>
          editingId === group.id ? (
            <input
              key={group.id}
              className="group-new"
              value={editDraft}
              autoFocus
              onChange={(event) => setEditDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') {
                  setEditingId(null)
                  setEditDraft('')
                }
              }}
            />
          ) : (
            <button
              key={group.id}
              type="button"
              ref={setPillRef(group.id)}
              className={[
                'group-pill',
                active === group.id ? 'is-active' : '',
                visibleIds && !visibleIds.has(group.id) && editingId !== group.id ? 'is-hidden' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(group.id)}
              onDoubleClick={() => {
                setEditingId(group.id)
                setEditDraft(group.name)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({
                  id: group.id,
                  name: group.name,
                  x: Math.min(event.clientX, window.innerWidth - 130),
                  y: Math.min(event.clientY, window.innerHeight - 84)
                })
              }}
              title="双击重命名 · 右键更多"
            >
              {group.name}
              {(counts.get(group.id) ?? 0) > 0 && (
                <span className="group-pill__count">{counts.get(group.id)}</span>
              )}
            </button>
          )
        )}

        {hiddenGroups.length > 0 && (
          <div className="group-more" ref={moreWrapRef}>
            <button
              type="button"
              ref={setPillRef('__more__')}
              className={`group-pill group-pill--more ${
                active && hiddenGroups.some((group) => group.id === active) ? 'is-active' : ''
              }`}
              onClick={toggleMore}
              title="更多分组"
            >
              更多
              <span className="group-pill__count">{hiddenGroups.length}</span>
              <svg className="group-more__caret" viewBox="0 0 8 8" aria-hidden="true">
                <path d="M1.6 3 4 5.4 6.4 3" />
              </svg>
            </button>
          </div>
        )}

        {creating ? (
          <input
            className="group-new"
            value={draft}
            autoFocus
            placeholder="分组名"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitCreate}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitCreate()
              if (event.key === 'Escape') {
                setCreating(false)
                setDraft('')
              }
            }}
          />
        ) : (
          <button
            type="button"
            ref={setPillRef('__add__')}
            className="group-add"
            onClick={() => setCreating(true)}
            title="新建分组"
          >
            <PlusIcon />
          </button>
        )}
      </nav>

      {menu && (
        <div
          className="ctx"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={() => {
              setEditingId(menu.id)
              setEditDraft(menu.name)
              setMenu(null)
            }}
          >
            重命名
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => {
              onRemove(menu.id)
              setMenu(null)
            }}
          >
            删除分组
          </button>
        </div>
      )}

      {more && hiddenGroups.length > 0 && (
        <div
          className="ctx group-menu"
          ref={menuRef}
          style={{ left: more.x, top: more.y, maxWidth: 220 }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {hiddenGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`group-menu__item ${group.id === active ? 'is-current' : ''}`}
              onClick={() => {
                onSelect(group.id)
                setMore(null)
              }}
            >
              <span className="ctx__label">{group.name}</span>
              {(counts.get(group.id) ?? 0) > 0 && (
                <span className="ctx__count">{counts.get(group.id)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
