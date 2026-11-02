import { CloseIcon, SearchIcon } from './icons'

interface Props {
  value: string
  onChange: (value: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  /** 右侧附加控件（排序入口）；搜索框本身不管它长什么样 */
  trailing?: React.ReactNode
}

export function SearchBar({ value, onChange, inputRef, trailing }: Props) {
  return (
    <div className="searchbar">
      <SearchIcon />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索名称、路径或内容"
        spellCheck={false}
      />
      {value && (
        <button type="button" className="searchbar__clear" onClick={() => onChange('')} title="清空">
          <CloseIcon />
        </button>
      )}
      {trailing}
    </div>
  )
}
