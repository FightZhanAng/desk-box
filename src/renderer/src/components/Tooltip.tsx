import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * 统一的悬浮提示层。
 *
 * 之前全靠 `title` 属性，那是 Windows 原生 tooltip：白底、黑字、硬边框、
 * 跟玻璃体系完全不搭，而且 CSS 一行都碰不到。这里自己画一个：
 *
 * - 触发源用属性声明，不包组件、不改结构：
 *     data-tip        单行文案（图标按钮、胶囊）
 *     data-tip-title  标题 + data-tip-sub 次要行 + data-tip-note 操作提示（卡片）
 * - 事件委托挂在 document 上，全应用只需要这一个实例。
 * - 位置优先贴在元素下方居中，下方放不下翻到上方，水平夹在窗口内。
 */

const HOST_SELECTOR = '[data-tip],[data-tip-title]'
/** 卡片这种大块目标慢一点，避免扫过一片卡片时一路闪 */
const SHOW_DELAY = 420
const GAP = 8
const EDGE = 8

interface TipContent {
  title: string
  sub?: string
  note?: string
  plain: boolean
}

interface TipState extends TipContent {
  host: HTMLElement
}

interface Placement {
  x: number
  y: number
  side: 'top' | 'bottom'
}

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null)
  const [place, setPlace] = useState<Placement | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const active = useRef<HTMLElement | null>(null)
  /** 右键 / 点击过的宿主不再自动弹提示，直到鼠标离开它 */
  const muted = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!tip) {
      setPlace(null)
      return
    }
    const el = layer.current
    if (!el) return

    const rect = tip.host.getBoundingClientRect()
    // 宿主已经不在文档里（列表刷新、切分组）：直接收掉，别把提示钉在左上角
    if (rect.width === 0 && rect.height === 0) {
      setTip(null)
      return
    }

    const w = el.offsetWidth
    const h = el.offsetHeight
    const center = rect.left + rect.width / 2
    const x = Math.max(EDGE, Math.min(center - w / 2, window.innerWidth - EDGE - w))

    let y = rect.bottom + GAP
    let side: Placement['side'] = 'bottom'
    if (y + h > window.innerHeight - EDGE) {
      const above = rect.top - GAP - h
      if (above >= EDGE) {
        y = above
        side = 'top'
      } else {
        // 上下都塞不下：贴着窗口底边，宁可盖住目标也别溢出
        y = Math.max(EDGE, window.innerHeight - EDGE - h)
      }
    }
    setPlace({ x, y, side })
  }, [tip])

  useEffect(() => {
    const clearTimer = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }

    const hide = () => {
      clearTimer()
      active.current = null
      setTip(null)
    }

    const reveal = (el: HTMLElement) => {
      // 菜单开着的时候不弹提示：两个浮层叠在一起既挡视线又抢焦点
      if (document.querySelector('.item-menu, .ctx')) return
      const title = el.dataset.tipTitle ?? el.dataset.tip ?? ''
      if (!title) return
      const sub = el.dataset.tipSub || undefined
      const note = el.dataset.tipNote || undefined
      setTip({ host: el, title, sub, note, plain: !sub && !note })
    }

    const schedule = (el: HTMLElement) => {
      clearTimer()
      active.current = el
      setTip(null)
      timer.current = window.setTimeout(() => reveal(el), SHOW_DELAY)
    }

    const hostOf = (target: EventTarget | null): HTMLElement | null =>
      (target as Element | null)?.closest?.(HOST_SELECTOR) as HTMLElement | null

    const onOver = (event: MouseEvent) => {
      const el = hostOf(event.target)
      if (!el) return
      // 在同一个宿主内部从图标移到文字，不算换目标
      if (el === active.current) return
      if (muted.current && el !== muted.current) muted.current = null
      if (el === muted.current) return
      schedule(el)
    }

    const onOut = (event: MouseEvent) => {
      const el = hostOf(event.target)
      if (!el) return
      const next = event.relatedTarget as Node | null
      if (next && el.contains(next)) return
      if (el === muted.current) muted.current = null
      if (el === active.current) hide()
    }

    // 键盘 Tab 过来时也提示；鼠标点出来的 focus 不算（:focus-visible 会区分）
    const onFocusIn = (event: FocusEvent) => {
      const el = hostOf(event.target)
      if (!el || el === active.current) return
      if (!el.matches(':focus-visible')) return
      if (el === muted.current) return
      schedule(el)
    }

    const onFocusOut = (event: FocusEvent) => {
      const el = hostOf(event.target)
      if (el && el === active.current) hide()
    }

    /** 只要界面动了，提示的位置就不再可信，一律收掉 */
    const dismiss = () => hide()
    const onPress = (event: MouseEvent) => {
      const el = hostOf(event.target)
      if (el) muted.current = el
      hide()
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('mousedown', onPress, true)
    document.addEventListener('contextmenu', onPress, true)
    document.addEventListener('wheel', dismiss, { passive: true, capture: true })
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    return () => {
      clearTimer()
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('mousedown', onPress, true)
      document.removeEventListener('contextmenu', onPress, true)
      document.removeEventListener('wheel', dismiss, true)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('blur', dismiss)
    }
  }, [])

  return (
    <div
      ref={layer}
      className={['tip', tip?.plain ? 'is-plain' : '', place ? 'is-in' : '']
        .filter(Boolean)
        .join(' ')}
      style={place ? { transform: `translate3d(${place.x}px, ${place.y}px, 0)` } : undefined}
      data-side={place?.side ?? 'bottom'}
      role="tooltip"
      aria-hidden={place ? undefined : true}
    >
      {tip && (
        <>
          <span className="tip__title">{tip.title}</span>
          {tip.sub && <span className="tip__sub">{tip.sub}</span>}
          {tip.note && (
            <>
              {/* 没有次要行时不画分隔线，否则标题下方会多出一条悬空的横线 */}
              {tip.sub && <i className="tip__rule" aria-hidden="true" />}
              <span className="tip__note">{tip.note}</span>
            </>
          )}
        </>
      )}
    </div>
  )
}
