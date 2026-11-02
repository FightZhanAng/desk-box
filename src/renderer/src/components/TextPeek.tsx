import { useEffect, useState } from 'react'

interface Props {
  /** 片段正文，即 Item.target */
  content: string
  /** 弹窗内「复制全文」后的回执文案 */
  onCopy: (text: string) => void
  onClose: () => void
}

/**
 * 片段的「瞄一眼」弹窗。
 *
 * 以前片段的双击是「复制到剪贴板」，看不见摸不着 —— 收纳久了根本不记得
 * 这条片段里存的是什么。现在双击先看内容，看完再决定要不要复制：
 * 弹窗里 Esc / 点遮罩 / 关闭按钮都能走，复制按钮给一段明确的回执。
 */
export function TextPeek({ content, onCopy, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
    // window 的捕获阶段先于 App.tsx 挂在同节点的冒泡监听：stopPropagation
    // 能拦住它，按 Esc 只关弹窗、不会顺手清掉多选
  }, [onClose])

  const count = content.replace(/\s+/g, ' ').trim().length
  const lines = content.split('\n').length

  return (
    <div
      className="peek__scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="peek"
        role="dialog"
        aria-modal="true"
        aria-label={`片段预览：${content.slice(0, 24)}`}
      >
        <header className="peek__head">
          <h2 className="peek__title">片段预览</h2>
          <span className="peek__count">
            {count} 字 · {lines} 行
            {count !== content.length && ` · 原文 ${content.length} 字符`}
          </span>
          <button type="button" className="peek__close" onClick={onClose} title="关闭预览 (Esc)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        </header>

        <div className="peek__body" tabIndex={0}>
          {content}
        </div>

        <footer className="peek__foot">
          <button
            type="button"
            className="peek__copy"
            onClick={() => {
              onCopy(content)
              setCopied(true)
            }}
          >
            {copied ? '已复制' : '复制全文'}
          </button>
        </footer>
      </section>
    </div>
  )
}
