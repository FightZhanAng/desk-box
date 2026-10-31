import type { ItemView } from '@shared/types'
import { hostOf } from '@shared/url'

/**
 * 收纳项的图标。
 *
 * 文件和文件夹不再用系统图标（Windows 那套蓝黄文件夹跟这套界面完全不搭），
 * 改成按扩展名分组的矢量图形：统一的「纸张 + 折角」底形，中间压一个白色标记。
 * 链接和文本仍然用色块，但换成主题变量控制，深色主题下不会亮得刺眼。
 */

const LINK_COLORS = ['#b5623a', '#7d6a9c', '#4f7d5b', '#3f6f8f', '#a8724b', '#8a5a6b']

function seedColor(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return LINK_COLORS[hash % LINK_COLORS.length]
}

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

/** 文件夹背板：带一个凸起的标签，整片用 55% 透明度，压上前片就有厚度 */
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

/** 压在纸张下半部的白色类型标记 */
function Mark({ kind }: { kind: FileKind }) {
  switch (kind) {
    case 'image':
      return (
        <>
          <circle cx="12.2" cy="15.4" r="1.85" fill="#fff" />
          <path d="M8.4 24.6 12.9 18.7l3 3.5 2.6-3 4.6 5.4z" fill="#fff" />
        </>
      )
    case 'doc':
      return (
        <path
          d="M9.8 15.4h12.4M9.8 19h12.4M9.8 22.6h7.6"
          stroke="#fff"
          strokeWidth="1.65"
          strokeLinecap="round"
        />
      )
    case 'sheet':
      return (
        <>
          <rect x="9.6" y="14.4" width="12.6" height="10" rx="1.3" stroke="#fff" strokeWidth="1.5" />
          <path
            d="M9.6 17.8h12.6M9.6 21h12.6M13.4 14.4v10M18 14.4v10"
            stroke="#fff"
            strokeWidth="1.1"
          />
        </>
      )
    case 'code':
      return (
        <>
          <path
            d="M13.5 15.2 9.9 19.4l3.6 4.2"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 15.2l3.6 4.2-3.6 4.2"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )
    case 'archive':
      // 前面试过「档案盒」（像软盘）和「拉链 + 方块」（像钥匙孔）。
      // 结论是细节越多越糊，最后只留一条竖着的白色拉链：白条 + 交错挖空的齿。
      // 竖条本身就是很强的形状信号，压到 20px 也不会散。
      return (
        <>
          <rect x="14.1" y="13.4" width="3.8" height="11.4" rx="1.4" fill="#fff" />
          <rect x="14.4" y="15.2" width="1.5" height="1.7" rx="0.4" fill="currentColor" />
          <rect x="16.1" y="17.5" width="1.5" height="1.7" rx="0.4" fill="currentColor" />
          <rect x="14.4" y="19.8" width="1.5" height="1.7" rx="0.4" fill="currentColor" />
          <rect x="16.1" y="22.1" width="1.5" height="1.4" rx="0.4" fill="currentColor" />
        </>
      )
    case 'media':
      return <path d="M13.4 14.4 20.4 19.4l-7 5z" fill="#fff" />
    case 'app':
      return (
        <>
          <rect x="9.4" y="14.2" width="13" height="10.2" rx="2.2" stroke="#fff" strokeWidth="1.5" />
          <circle cx="12.4" cy="17.2" r="0.95" fill="#fff" />
          <path d="M9.4 21.4h13" stroke="#fff" strokeWidth="1.1" />
        </>
      )
    default:
      return (
        <path
          d="M9.8 15.6h12.4M9.8 19.4h8.6"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )
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
      <span className="glyph-chip" style={{ background: seedColor(item.target) }}>
        {(hostOf(item.target)[0] ?? 'L').toUpperCase()}
      </span>
    )
  }

  if (item.kind === 'text') {
    return <span className="glyph-chip is-text">{'\u201C'}</span>
  }

  if (!item.exists) {
    return <MissingGlyph folder={item.kind === 'folder'} />
  }

  if (item.kind === 'folder') {
    return (
      <svg className="glyph glyph--folder" viewBox="0 0 32 32" aria-hidden="true">
        <FolderBack />
        <FolderFront />
        <path d="M3.4 13.4h25.2" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      </svg>
    )
  }

  const kind = kindOf(item.ext)
  return (
    <svg className={`glyph glyph--${kind}`} viewBox="0 0 32 32" aria-hidden="true">
      <PageShape />
      <path d="M17.8 3.2 25 10.6h-5.4a1.8 1.8 0 0 1-1.8-1.8V3.2Z" fill="rgba(0,0,0,0.16)" />
      <Mark kind={kind} />
    </svg>
  )
}
