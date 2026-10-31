import { useState } from 'react'

interface Props {
  mode: 'link' | 'text'
  onClose: () => void
  onSubmit: (value: string) => void
}

export function AddSheet({ mode, onClose, onSubmit }: Props) {
  const [value, setValue] = useState('')
  const isLink = mode === 'link'

  const submit = (): void => {
    const text = value.trim()
    if (!text) return
    onSubmit(text)
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet">
        <div className="sheet__head">
          <span className="sheet__title">{isLink ? '收一条链接' : '存一段文字'}</span>
          <span className="sheet__sub">{isLink ? '回车即可收纳' : 'Ctrl + 回车收纳'}</span>
        </div>

        {isLink ? (
          <div className="field">
            <span className="field__label">网址</span>
            <input
              className="field__input"
              autoFocus
              value={value}
              placeholder="https://example.com 或直接粘贴"
              spellCheck={false}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
                if (event.key === 'Escape') onClose()
              }}
            />
          </div>
        ) : (
          <div className="field">
            <span className="field__label">内容</span>
            <textarea
              className="field__textarea"
              autoFocus
              value={value}
              placeholder="一段草稿、一行命令、一个常用地址……"
              spellCheck={false}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  submit()
                }
                if (event.key === 'Escape') onClose()
              }}
            />
          </div>
        )}

        <div className="sheet__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!value.trim()}
            onClick={submit}
          >
            收进盒子
          </button>
        </div>
      </div>
    </>
  )
}
