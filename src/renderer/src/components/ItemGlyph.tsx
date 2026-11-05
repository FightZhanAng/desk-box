import type { ItemView } from '@shared/types'

/**
 * 收纳项的图标。
 *
 * 文件和文件夹不用系统那套蓝黄图标，改成按扩展名分族的矢量图形：
 * 统一的「纸张 + 折角」底形，中间压一个类型标记。
 * 链接与片段是整块类型色，标记颜色由 --glyph-mark 决定 ——
 * 浅色档是白，暗色档自动压成墨色，不用为每套主题单独画图。
 */

type FileKind = 'image' | 'doc' | 'sheet' | 'code' | 'archive' | 'media' | 'app' | 'file'

const EXT_KINDS: Record<string, FileKind> = {}

function register(kind: FileKind, exts: string[]): void {
  for (const ext of exts) EXT_KINDS[ext] = kind
}

register('image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'heic', 'avif', 'tif', 'tiff', 'psd'])
register('doc', ['md', 'markdown', 'txt', 'doc', 'docx', 'rtf', 'pdf', 'odt', 'pages'])
register('sheet', ['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers'])
register('code', [
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'html', 'htm', 'css', 'scss', 'less',
  'py', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'cs', 'php', 'rb', 'sh', 'ps1', 'bat',
  'yml', 'yaml', 'toml', 'ini', 'xml', 'sql', 'lua', 'vue', 'svelte'
])
register('archive', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'])
register('media', ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'])
register('app', ['exe', 'msi', 'app', 'dmg', 'deb', 'rpm', 'apk', 'lnk'])

function kindOf(ext: string): FileKind {
  return EXT_KINDS[ext] ?? 'file'
}

/** 纸张底形，x 6..25 / y 3.2..28.8 */
function PageShape() {
  return (
    <path
      d="M8.4 3.2h9.4L25 10.6v15.8a2.4 2.4 0 0 1-2.4 2.4H8.4A2.4 2.4 0 0 1 6 26.4V5.6a2.4 2.4 0 0 1 2.4-2.4Z"
      fill="currentColor"
    />
  )
}

/** 文件夹背板：带一个凸起的标签，整片 55% 透明度，压上前片就有厚度 */
function FolderBack() {
  return (
    <path
      d="M3.4 8.6a2.6 2.6 0 0 1 2.6-2.6h5.2l2.6 3h12.2a2.6 2.6 0 0 1 2.6 2.6v13.2a2.6 2.6 0 0 1-2.6 2.6H6a2.6 2.6 0 0 1-2.6-2.6V8.6Z"
      fill="currentColor"
      fillOpacity="0.55"
    />
  )
}

/** 文件夹前片：只盖下半截，底角圆 */
function FolderFront() {
  return (
    <path
      d="M3.4 13.4h25.2v10.2a2.6 2.6 0 0 1-2.6 2.6H6a2.6 2.6 0 0 1-2.6-2.6V13.4Z"
      fill="currentColor"
    />
  )
}

/** 压在纸张下半部的类型标记；颜色统一交给 var(--glyph-mark) */
function Mark({ kind }: { kind: FileKind }) {
  switch (kind) {
    case 'image':
      return (
        <>
          <circle className="glyph__fill" cx="12.2" cy="15.4" r="1.85" />
          <path className="glyph__fill" d="M8.4 24.6 12.9 18.7l3 3.5 2.6-3 4.6 5.4z" />
        </>
      )
    case 'doc':
      return (
        <path className="glyph__stroke" strokeWidth="1.65" d="M9.8 15.4h12.4M9.8 19h12.4M9.8 22.6h7.6" />
      )
    case 'sheet':
      return (
        <>
          <rect className="glyph__stroke" strokeWidth="1.5" x="9.6" y="14.4" width="12.6" height="10" rx="1.3" />
          <path
            className="glyph__stroke"
            strokeWidth="1.1"
            d="M9.6 17.8h12.6M9.6 21h12.6M13.4 14.4v10M18 14.4v10"
          />
        </>
      )
    case 'code':
      return (
        <>
          <path className="glyph__stroke" strokeWidth="1.7" d="M13.5 15.2 9.9 19.4l3.6 4.2" />
          <path className="glyph__stroke" strokeWidth="1.7" d="M18.5 15.2l3.6 4.2-3.6 4.2" />
        </>
      )
    case 'archive':
      // 前面试过「档案盒」（像软盘）和「拉链 + 方块」（像钥匙孔）。
      // 结论是细节越多越糊，最后只留一条竖着的白色拉链：白条 + 交错挖空的齿。
      return (
        <>
          <rect className="glyph__fill" x="14.1" y="13.4" width="3.8" height="11.4" rx="1.4" />
          <rect x="14.4" y="15.2" width="1.5" height="1.7" rx="0.4" fill="currentColor" />
          <rect x="16.1" y="17.5" width="1.5" height="1.7" rx="0.4" fill="currentColor" />
          <rect x="14.4" y="19.8" width="1.5" height="1.7" rx="0.4" fill="currentColor" />
          <rect x="16.1" y="22.1" width="1.5" height="1.4" rx="0.4" fill="currentColor" />
        </>
      )
    case 'media':
      return <path className="glyph__fill" d="M13.4 14.4 20.4 19.4l-7 5z" />
    case 'app':
      return (
        <>
          <rect className="glyph__stroke" strokeWidth="1.5" x="9.4" y="14.2" width="13" height="10.2" rx="2.2" />
          <circle className="glyph__fill" cx="12.4" cy="17.2" r="0.95" />
          <path className="glyph__stroke" strokeWidth="1.1" d="M9.4 21.4h13" />
        </>
      )
    default:
      return <path className="glyph__stroke" strokeWidth="1.6" d="M9.8 15.6h12.4M9.8 19.4h8.6" />
  }
}

function MissingGlyph({ folder }: { folder: boolean }) {
  return (
    <svg className="glyph glyph--missing" viewBox="0 0 32 32" aria-hidden="true">
      {folder ? (
        <path
          d="M3.4 8.6a2.6 2.6 0 0 1 2.6-2.6h5.2l2.6 3h12.2a2.6 2.6 0 0 1 2.6 2.6v13.2a2.6 2.6 0 0 1-2.6 2.6H6a2.6 2.6 0 0 1-2.6-2.6V8.6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 2.4"
        />
      ) : (
        <path
          d="M8.4 3.2h9.4L25 10.6v15.8a2.4 2.4 0 0 1-2.4 2.4H8.4A2.4 2.4 0 0 1 6 26.4V5.6a2.4 2.4 0 0 1 2.4-2.4Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 2.4"
        />
      )}
      <path d="M16 12.6v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="23.4" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function ItemGlyph({ item }: { item: ItemView }) {
  if (item.kind === 'link') {
    return (
      <svg className="glyph glyph--link" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="4" y="4" width="24" height="24" rx="7" fill="currentColor" />
        <g className="glyph__stroke" strokeWidth="1.6">
          <path d="M13 19a3 3 0 0 0 4.3 0l2.2-2.2a3 3 0 0 0-4.3-4.3l-.9.9" />
          <path d="M19 13a3 3 0 0 0-4.3 0l-2.2 2.2a3 3 0 0 0 4.3 4.3l.9-.9" />
        </g>
      </svg>
    )
  }

  if (item.kind === 'text') {
    return (
      <svg className="glyph glyph--text" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="4" y="4" width="24" height="24" rx="7" fill="currentColor" />
        <path className="glyph__stroke" strokeWidth="1.7" d="M10 12h12M10 16h9M10 20h6" />
      </svg>
    )
  }

  if (!item.exists) {
    return <MissingGlyph folder={item.kind === 'folder' || item.linkDir} />
  }

  if (item.kind === 'folder') {
    return (
      <svg className="glyph glyph--folder" viewBox="0 0 32 32" aria-hidden="true">
        <FolderBack />
        <FolderFront />
        <path className="glyph__hair" d="M3.4 13.4h25.2" strokeWidth="1" />
      </svg>
    )
  }

  // 指向文件夹的快捷方式：同一张矢量文件夹，左下角压一枚「捷径」小圆徽做区分
  // —— Windows 用户本来就认识「箭头角标 = 快捷方式」这套语言
  if (item.linkDir) {
    return (
      <svg className="glyph glyph--folder glyph--shortcut" viewBox="0 0 32 32" aria-hidden="true">
        <FolderBack />
        <FolderFront />
        <path className="glyph__hair" d="M3.4 13.4h25.2" strokeWidth="1" />
        <circle className="glyph__badge" cx="23.6" cy="24" r="6.4" />
        <path className="glyph__badge-arrow" d="M21 26.6 26.2 21.4M26.2 21.4h-3.6M26.2 21.4v3.6" />
      </svg>
    )
  }

  const kind = kindOf(item.ext)
  return (
    <svg className={`glyph glyph--${kind}`} viewBox="0 0 32 32" aria-hidden="true">
      <PageShape />
      <path d="M17.8 3.2 25 10.6h-5.4a1.8 1.8 0 0 1-1.8-1.8V3.2Z" className="glyph__fold" />
      <Mark kind={kind} />
    </svg>
  )
}
