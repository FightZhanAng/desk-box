/**
 * 全部图标手写 SVG，零外部依赖、零 emoji。
 * 统一 24 栅格、1.6 描边、圆头圆角，保证同一套视觉语言。
 */

interface IconProps {
  className?: string
}

function base(className?: string) {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
}

/** 抽屉：品牌标记 */
export function DrawerIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.4" y="4.2" width="17.2" height="15.6" rx="2.8" />
      <path d="M3.4 9.4h17.2" />
      <path d="M9.6 13.6h4.8" />
      <path d="M3.4 17.2h17.2" />
    </svg>
  )
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3.2v4.4" />
      <path d="M8.6 7.6h6.8l-.9 4.4a1.6 1.6 0 0 1-1.6 1.3h-1.8a1.6 1.6 0 0 1-1.6-1.3L8.6 7.6Z" />
      <path d="M12 14.1v6.4" />
    </svg>
  )
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.6v2.5M12 18.9v2.5M2.6 12h2.5M18.9 12h2.5M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8" />
    </svg>
  )
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5.5 12h13" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 5.2v13.6M5.2 12h13.6" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="10.6" cy="10.6" r="5.9" />
      <path d="M15.1 15.1l4.4 4.4" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  )
}

export function FilePlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M13.2 3.2H7.4a2.2 2.2 0 0 0-2.2 2.2v13.2a2.2 2.2 0 0 0 2.2 2.2h9.2a2.2 2.2 0 0 0 2.2-2.2V8.8l-5.6-5.6Z" />
      <path d="M13.2 3.2v5.6h5.6" />
    </svg>
  )
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l2.9-2.9a3.6 3.6 0 0 0-5.1-5.1l-1.4 1.4" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-2.9 2.9a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4" />
    </svg>
  )
}

export function TextIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4.5 6.4h15M4.5 11.4h10.2M4.5 16.4h7" />
    </svg>
  )
}

export function FolderIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3.2 7.6a2.2 2.2 0 0 1 2.2-2.2h3.4l1.9 2.1h7.9a2.2 2.2 0 0 1 2.2 2.2v7.1a2.2 2.2 0 0 1-2.2 2.2H5.4a2.2 2.2 0 0 1-2.2-2.2V7.6Z" />
    </svg>
  )
}

export function ArrowDownIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 4.5v13" />
      <path d="M6.8 12.2 12 17.5l5.2-5.3" />
    </svg>
  )
}

/** 排序：三条长度递减的横线 + 上下箭头，一眼看出是「换个排法」而不是「设置」 */
export function SortIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 7h11" />
      <path d="M4 12h7" />
      <path d="M4 17h4" />
      <path d="M18.5 5.5v13" />
      <path d="M15.8 15.6 18.5 18.3l2.7-2.7" />
    </svg>
  )
}

/** 整理模式：两列小方块 + 双向箭头，跟「排序」区分开 */
export function ArrangeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="4.6" width="6" height="6" rx="1.4" />
      <rect x="14" y="4.6" width="6" height="6" rx="1.4" />
      <rect x="4" y="13.4" width="6" height="6" rx="1.4" />
      <rect x="14" y="13.4" width="6" height="6" rx="1.4" />
    </svg>
  )
}

/** 空状态：箭头落进一只开口的盒子 */
export function EmptyDrawerIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 96 80"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 落下的箭头 */}
      <path d="M48 5v19" />
      <path d="M40 16.5 48 24.5l8-8" />
      {/* 盒口 */}
      <path d="M15 37.5h66" opacity="0.9" />
      {/* 盒身：上宽下窄 */}
      <path d="M19.5 37.5h57l-5.4 30.2a4.5 4.5 0 0 1-4.5 3.8H29.4a4.5 4.5 0 0 1-4.5-3.8L19.5 37.5Z" />
      {/* 把手 */}
      <path d="M39.5 54h17" opacity="0.5" />
    </svg>
  )
}
