import { CloseIcon, SearchIcon } from './icons'

interface Props {
  value: string
  onChange: (value: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

export function SearchBar({ value, onChange, inputRef }: Props) {
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
    </div>
  )
}
