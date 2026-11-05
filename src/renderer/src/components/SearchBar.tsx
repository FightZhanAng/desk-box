import { CloseIcon, SearchIcon } from './icons'

interface Props {
  value: string
  onChange: (value: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  /** 右侧附加控件（排序入口）；搜索框本身不管它长什么样 */
  trailing?: React.ReactNode
}

/**
 * 搜索 + 排序。
 *
 * 搜索是一个整颗胶囊（图标压在左侧、清空按钮压在右侧），排序按钮是胶囊外
 * 独立的一颗圆钮 —— 跟设计稿一致：两者同高，但只有输入区有底。
 */
export function SearchBar({ value, onChange, inputRef, trailing }: Props) {
  return (
    <div className="searchbar">
      <label className="search">
        <SearchIcon />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="搜索名称、路径、备注，或拼音首字母"
          spellCheck={false}
        />
        {value && (
          <button type="button" className="search__clear" onClick={() => onChange('')} aria-label="清空搜索"
              data-tip="清空搜索">
            <CloseIcon />
          </button>
        )}
      </label>
      {trailing}
    </div>
  )
}
