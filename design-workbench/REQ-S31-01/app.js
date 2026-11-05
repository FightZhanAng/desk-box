/* ==========================================================================
   REQ-S31-01 · 收纳盒 UI 重构原型
   数据形状对齐 src/shared/types.ts 的 ItemView；
   匹配 / 排序 / 常用三段逻辑对齐 src/renderer/src/lib/ 的实现；
   纯内存演示，不写真实配置文件，也不发 IPC。
   ========================================================================== */

const DAY = 86400000
const now = Date.now()

const GROUPS = [
  { id: 'g-inbox', name: '待处理', order: 0 },
  { id: 'g-work', name: '工作', order: 1 },
  { id: 'g-tools', name: '工具', order: 2 },
  { id: 'g-read', name: '阅读', order: 3 },
  { id: 'g-home', name: '生活', order: 4 }
]

const ITEMS = [
  mk('i1', 'file', '需求评审纪要.docx', 'D:\\工作\\项目\\需求评审纪要.docx', 'g-work', '和前端一起过了一遍', true, 'docx', 42, 26, 1),
  mk('i2', 'folder', '原型与走查', 'D:\\工作\\项目\\原型与走查', 'g-work', '', true, '', 31, 12, 2),
  mk('i3', 'link', 'Glassmorphism 规范', 'https://www.figma.com/community/glassmorphism', 'g-work', '配色参考', false, '', 18, 5, 3),
  mk('i4', 'text', '周报模板', '本周完成：\n1. 收纳盒 UI 重构走查\n2. 图标解析兜底补齐\n\n下周计划：\n1. 分组胶囊收纳策略\n2. 更新通道灰度', 'g-work', '', false, '', 24, 3, 4),
  mk('i5', 'file', '接口联调笔记.md', 'D:\\工作\\项目\\接口联调笔记.md', 'g-work', '', false, 'md', 9, 8, 5),
  mk('i6', 'folder', '旧版设计稿', 'D:\\工作\\归档\\旧版设计稿', 'g-work', '可能被挪走了', false, '', 3, 30, 6, { exists: false }),
  mk('i7', 'file', '批量导出.xlsx', 'D:\\工作\\报表\\批量导出.xlsx', 'g-work', '', false, 'xlsx', 12, 20, 7),

  mk('i8', 'file', '报销单-3月.pdf', 'D:\\下载\\报销单-3月.pdf', 'g-inbox', '待提交', true, 'pdf', 15, 22, 8),
  mk('i9', 'file', '会议录屏.mp4', 'D:\\下载\\会议录屏.mp4', 'g-inbox', '', false, 'mp4', 6, 18, 9),
  mk('i10', 'text', '待办', '回消息 → 提交报销 → 约设计评审', 'g-inbox', '', false, '', 2, 24, 10),
  mk('i11', 'file', '合同草稿.pdf', 'D:\\下载\\合同草稿.pdf', 'g-inbox', '', false, 'pdf', 4, 25, 11),

  mk('i12', 'file', 'Visual Studio Code', 'C:\\Program Files\\Microsoft VS Code\\Code.exe', 'g-tools', '', true, 'exe', 88, 0.2, 12),
  mk('i13', 'folder', '项目素材（快捷方式）', 'D:\\素材', 'g-tools', '', false, '', 27, 9, 13, { linkDir: true }),
  mk('i14', 'file', '便携工具包.zip', 'D:\\工具\\便携工具包.zip', 'g-tools', '', false, 'zip', 7, 21, 14),
  mk('i15', 'file', 'sortItems.ts', 'D:\\我的空间\\github\\desk-box\\src\\renderer\\src\\lib\\sortItems.ts', 'g-tools', '', false, 'ts', 19, 4, 15),
  mk('i16', 'file', '壁纸-山脊.png', 'D:\\图片\\壁纸-山脊.png', 'g-tools', '', false, 'png', 11, 16, 16),

  mk('i17', 'link', 'Electron 文档', 'https://www.electronjs.org/docs/latest', 'g-read', '', false, '', 16, 7, 17),
  mk('i18', 'file', '设计系统笔记.md', 'D:\\阅读\\设计系统笔记.md', 'g-read', '', false, 'md', 5, 14, 18),
  mk('i19', 'link', 'MDN backdrop-filter', 'https://developer.mozilla.org/docs/Web/CSS/backdrop-filter', 'g-read', '', false, '', 8, 11, 19),

  mk('i20', 'folder', '家庭账单', 'D:\\生活\\家庭账单', 'g-home', '', false, '', 10, 13, 20),
  mk('i21', 'file', '旅行清单.txt', 'D:\\生活\\旅行清单.txt', 'g-home', '', false, 'txt', 13, 10, 21),
  mk('i22', 'link', '12306 购票', 'https://www.12306.cn', 'g-home', '', false, '', 21, 6, 22)
]

function mk(id, kind, title, target, groupId, note, pinned, ext, openCount, agoDays, order, extra) {
  return Object.assign(
    {
      id: id,
      kind: kind,
      title: title,
      target: target,
      groupId: groupId,
      note: note,
      pinned: pinned,
      ext: ext,
      exists: true,
      linkDir: false,
      openCount: openCount,
      createdAt: now - order * DAY * 0.7,
      lastOpenedAt: now - agoDays * DAY,
      order: order,
      initials: ''
    },
    extra || {}
  )
}

/* 演示用检索别名：覆盖几组拼音首字母，验证 initials 匹配链路 */
const INITIALS = {
  i1: 'xqphjy',
  i2: 'yyzc',
  i4: 'zbmb',
  i5: 'jlldbj',
  i6: 'jbsjg',
  i7: 'pldc',
  i8: 'bxd3y',
  i9: 'hyly',
  i10: 'db',
  i11: 'htcg',
  i12: 'vscode',
  i13: 'xmsc',
  i14: 'bggjb',
  i16: 'bzsx',
  i17: 'dzwd',
  i18: 'sjxtbj',
  i20: 'jtzd',
  i21: 'lxqd',
  i22: '12306gp'
}
Object.keys(INITIALS).forEach(function (id) {
  ITEMS.find(function (it) {
    return it.id === id
  }).initials = INITIALS[id]
})

/* ==========================================================================
   纯逻辑：匹配 / 排序 / 常用（与 lib/ 实现对齐）
   ========================================================================== */

const FREQUENT_ID = 'freq'
const FREQUENT_LIMIT = 10
const OPACITY_MIN = 0.78
const SORT_LABELS = { custom: '手动整理', recent: '最近添加', opened: '最近打开', name: '按名称' }
const SORT_IDS = ['recent', 'opened', 'name', 'custom']
const THEME_NAMES = { wood: '暖木', night: '夜墨', celadon: '青瓷', indigo: '靛蓝' }

function matches(item, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const initialsMode = /^[a-z0-9]+$/i.test(q)
  return (
    item.title.toLowerCase().includes(q) ||
    item.target.toLowerCase().includes(q) ||
    item.note.toLowerCase().includes(q) ||
    (initialsMode && item.initials.includes(q))
  )
}

function sortItems(list, sortBy) {
  const arr = list.slice()
  if (sortBy === 'recent') arr.sort(function (a, b) { return b.createdAt - a.createdAt })
  else if (sortBy === 'opened') arr.sort(function (a, b) { return b.lastOpenedAt - a.lastOpenedAt })
  else if (sortBy === 'name') arr.sort(function (a, b) { return a.title.localeCompare(b.title, 'zh-CN') })
  else arr.sort(function (a, b) { return a.order - b.order || b.createdAt - a.createdAt })
  /* 固定项在任何排序下都恒置顶 */
  return arr
    .filter(function (i) { return i.pinned })
    .concat(arr.filter(function (i) { return !i.pinned }))
}

function frequentIds() {
  const top = ITEMS.slice()
    .sort(function (a, b) { return b.openCount - a.openCount })
    .slice(0, FREQUENT_LIMIT)
  return new Set(top.map(function (i) { return i.id }))
}

function metaOf(item) {
  if (!item.exists) return '路径失效'
  if (item.kind === 'link') return hostOf(item.target)
  if (item.kind === 'text') return item.target.replace(/\s+/g, ' ').trim().length + ' 字'
  if (item.kind === 'folder' || item.linkDir) return '文件夹'
  return item.ext ? item.ext.toUpperCase() : '文件'
}

function hostOf(url) {
  const m = /^https?:\/\/([^/]+)/i.exec(url)
  return m ? m[1].replace(/^www\./, '') : '链接'
}

function ago(ts) {
  const d = Math.max(0, Math.round((Date.now() - ts) / DAY))
  if (d === 0) return '今天'
  if (d === 1) return '昨天'
  if (d < 30) return d + ' 天前'
  return Math.round(d / 30) + ' 个月前'
}

function prettyHotkey(h) {
  return h.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

/* ==========================================================================
   图标：统一栅格、1.6 描边、圆头圆角，全部手写 SVG
   ========================================================================== */

const SW = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'

function S(d, extra) {
  return '<path d="' + d + '"' + (extra || '') + ' />'
}

const EXT_KINDS = {}
function REG(k, list) {
  list.forEach(function (e) { EXT_KINDS[e] = k })
}
REG('image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'])
REG('doc', ['md', 'txt', 'doc', 'docx', 'pdf', 'rtf'])
REG('sheet', ['xls', 'xlsx', 'csv'])
REG('code', ['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'go', 'rs', 'yml', 'toml'])
REG('archive', ['zip', 'rar', '7z', 'tar', 'gz'])
REG('media', ['mp4', 'mov', 'mkv', 'mp3', 'wav', 'flac'])
REG('app', ['exe', 'msi', 'lnk', 'apk'])
function kindOf(ext) {
  return EXT_KINDS[ext] || 'file'
}

const MARK = 'var(--glyph-mark)'

function mark(kind) {
  switch (kind) {
    case 'image':
      return (
        '<circle cx="12.2" cy="15.4" r="1.85" fill="' + MARK + '"/>' +
        S('M8.4 24.6 12.9 18.7l3 3.5 2.6-3 4.6 5.4z', ' fill="' + MARK + '"')
      )
    case 'doc':
      return S('M9.8 15.4h12.4M9.8 19h12.4M9.8 22.6h7.6', ' stroke="' + MARK + '" stroke-width="1.65" stroke-linecap="round" fill="none"')
    case 'sheet':
      return (
        '<rect x="9.6" y="14.4" width="12.6" height="10" rx="1.3" stroke="' + MARK + '" stroke-width="1.5" fill="none"/>' +
        S('M9.6 17.8h12.6M9.6 21h12.6M13.4 14.4v10M18 14.4v10', ' stroke="' + MARK + '" stroke-width="1.1" fill="none"')
      )
    case 'code':
      return (
        S('M13.5 15.2 9.9 19.4l3.6 4.2', ' stroke="' + MARK + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"') +
        S('M18.5 15.2l3.6 4.2-3.6 4.2', ' stroke="' + MARK + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"')
      )
    case 'archive':
      return (
        S('M16 13.4v2.4M16 17.4v2.4M16 21.4v2.6', ' stroke="' + MARK + '" stroke-width="1.6" stroke-linecap="round" fill="none"') +
        '<rect x="13" y="22" width="6" height="4.4" rx="1.2" stroke="' + MARK + '" stroke-width="1.3" fill="none"/>'
      )
    case 'media':
      return S('M13.8 15.6l7 3.8-7 3.8z', ' fill="' + MARK + '"')
    case 'app':
      return (
        '<rect x="9.6" y="14.4" width="12.6" height="10" rx="2.4" stroke="' + MARK + '" stroke-width="1.5" fill="none"/>' +
        S('M12.6 21.4l2.2-2.6 1.8 2 1.6-1.6 2.2 2.2', ' stroke="' + MARK + '" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"')
      )
    default:
      return S('M11 16.4h10M11 20h6.4', ' stroke="' + MARK + '" stroke-width="1.5" stroke-linecap="round" fill="none"')
  }
}

function glyphFor(item) {
  if (item.kind === 'link') {
    return (
      '<svg class="glyph glyph--link" viewBox="0 0 32 32" aria-hidden="true">' +
      '<rect x="4" y="4" width="24" height="24" rx="7" fill="currentColor"/>' +
      '<g fill="none" stroke="' + MARK + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      S('M13 19a3 3 0 0 0 4.3 0l2.2-2.2a3 3 0 0 0-4.3-4.3l-.9.9') +
      S('M19 13a3 3 0 0 0-4.3 0l-2.2 2.2a3 3 0 0 0 4.3 4.3l.9-.9') +
      '</g></svg>'
    )
  }
  if (item.kind === 'text') {
    return (
      '<svg class="glyph glyph--text" viewBox="0 0 32 32" aria-hidden="true">' +
      '<rect x="4" y="4" width="24" height="24" rx="7" fill="currentColor"/>' +
      S('M10 12h12M10 16h9M10 20h6', ' stroke="' + MARK + '" stroke-width="1.7" stroke-linecap="round" fill="none"') +
      '</svg>'
    )
  }
  if (item.kind === 'folder' || item.linkDir) {
    const badge = item.linkDir
      ? '<circle class="glyph__badge" cx="23.6" cy="24" r="6.4"/><path class="glyph__badge-arrow" d="M21 26.6 26.2 21.4M26.2 21.4h-3.6M26.2 21.4v3.6"/>'
      : ''
    return (
      '<svg class="glyph ' + (item.linkDir ? 'glyph--shortcut' : 'glyph--folder') + '" viewBox="0 0 32 32" aria-hidden="true">' +
      S('M3.4 8.6a2.6 2.6 0 0 1 2.6-2.6h5.2l2.6 3h12.2a2.6 2.6 0 0 1 2.6 2.6v13.2a2.6 2.6 0 0 1-2.6 2.6H6a2.6 2.6 0 0 1-2.6-2.6V8.6Z', ' fill="currentColor" fill-opacity="0.55"') +
      S('M3.4 13.4h25.2v10.2a2.6 2.6 0 0 1-2.6 2.6H6a2.6 2.6 0 0 1-2.6-2.6V13.4Z', ' fill="currentColor"') +
      badge +
      '</svg>'
    )
  }
  const kind = kindOf(item.ext)
  return (
    '<svg class="glyph glyph--' + kind + '" viewBox="0 0 32 32" aria-hidden="true">' +
    S('M8.4 3.2h9.4L25 10.6v15.8a2.4 2.4 0 0 1-2.4 2.4H8.4A2.4 2.4 0 0 1 6 26.4V5.6a2.4 2.4 0 0 1 2.4-2.4Z', ' fill="currentColor"') +
    S('M17.8 3.2 25 10.6h-5.4a1.8 1.8 0 0 1-1.8-1.8V3.2Z', ' fill="' + MARK + '" fill-opacity="0.28"') +
    mark(kind) +
    '</svg>'
  )
}

const ICON = {
  drawer: '<svg viewBox="0 0 24 24" ' + SW + '><rect x="3.4" y="4.2" width="17.2" height="15.6" rx="2.8"/>' + S('M3.4 9.4h17.2') + S('M9.6 13.6h4.8') + '</svg>',
  pin: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M12 3.2v4.4') + S('M8.6 7.6h6.8l-.9 4.4a1.6 1.6 0 0 1-1.6 1.3h-1.8a1.6 1.6 0 0 1-1.6-1.3L8.6 7.6Z') + S('M12 14.1v6.4') + '</svg>',
  gear: '<svg viewBox="0 0 24 24" ' + SW + '><circle cx="12" cy="12" r="3.1"/>' + S('M12 2.6v2.5M12 18.9v2.5M2.6 12h2.5M18.9 12h2.5M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8') + '</svg>',
  minus: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M5.5 12h13') + '</svg>',
  plus: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M12 5.2v13.6M5.2 12h13.6') + '</svg>',
  search: '<svg viewBox="0 0 24 24" ' + SW + '><circle cx="10.6" cy="10.6" r="5.9"/>' + S('M15.1 15.1l4.4 4.4') + '</svg>',
  close: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M6.5 6.5l11 11M17.5 6.5l-11 11') + '</svg>',
  filePlus: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M13.2 3.2H7.4a2.2 2.2 0 0 0-2.2 2.2v13.2a2.2 2.2 0 0 0 2.2 2.2h9.2a2.2 2.2 0 0 0 2.2-2.2V8.8l-5.6-5.6Z') + S('M13.2 3.2v5.6h5.6') + '</svg>',
  folder: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M3.2 7.6a2.2 2.2 0 0 1 2.2-2.2h3.4l1.9 2.1h7.9a2.2 2.2 0 0 1 2.2 2.2v7.1a2.2 2.2 0 0 1-2.2 2.2H5.4a2.2 2.2 0 0 1-2.2-2.2V7.6Z') + '</svg>',
  link: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M10.2 13.8a3.6 3.6 0 0 0 5.1 0l2.9-2.9a3.6 3.6 0 0 0-5.1-5.1l-1.4 1.4') + S('M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-2.9 2.9a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4') + '</svg>',
  text: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M4.5 6.4h15M4.5 11.4h10.2M4.5 16.4h7') + '</svg>',
  sort: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M4 7h11') + S('M4 12h7') + S('M4 17h4') + S('M18.5 5.5v13') + S('M15.8 15.6 18.5 18.3l2.7-2.7') + '</svg>',
  down: '<svg viewBox="0 0 24 24" ' + SW + '>' + S('M12 4.5v13') + S('M6.8 12.2 12 17.5l5.2-5.3') + '</svg>',
  empty: '<svg class="empty__art" viewBox="0 0 96 80" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    S('M48 5v19') + S('M40 16.5 48 24.5l8-8') + S('M15 37.5h66', ' opacity="0.9"') +
    S('M19.5 37.5h57l-5.4 30.2a4.5 4.5 0 0 1-4.5 3.8H29.4a4.5 4.5 0 0 1-4.5-3.8L19.5 37.5Z') +
    S('M39.5 54h17', ' opacity="0.5"') + '</svg>'
}

/* ==========================================================================
   渲染：一个 render(state) 同时服务活窗口与静态快照
   ========================================================================== */

function visibleItems(st) {
  let list = ITEMS
  if (st.group === FREQUENT_ID) {
    const f = frequentIds()
    list = list.filter(function (i) { return f.has(i.id) })
  } else if (st.group) {
    list = list.filter(function (i) { return i.groupId === st.group })
  }
  list = list.filter(function (i) { return matches(i, st.query) })
  return sortItems(list, st.sortBy)
}

function groupCounts() {
  const m = {}
  ITEMS.forEach(function (i) {
    m[i.groupId] = (m[i.groupId] || 0) + 1
  })
  return m
}

function render(st) {
  const vis = visibleItems(st)
  const total = ITEMS.length
  const cnt = groupCounts()
  const freqCount = frequentIds().size
  const activeGroup = GROUPS.find(function (g) { return g.id === st.group })

  const tabs = [
    '<button class="pill ' + (st.group === null ? 'is-active' : '') + '" data-act="group" data-id="__all__">全部<span class="pill__count">' + total + '</span></button>',
    freqCount
      ? '<button class="pill pill--star ' + (st.group === FREQUENT_ID ? 'is-active' : '') + '" data-act="group" data-id="' + FREQUENT_ID + '">常用<span class="pill__count">' + freqCount + '</span></button>'
      : ''
  ]
    .concat(
      GROUPS.map(function (g) {
        return (
          '<button class="pill ' + (st.group === g.id ? 'is-active' : '') + '" data-act="group" data-id="' + g.id + '">' +
          g.name + '<span class="pill__count">' + (cnt[g.id] || 0) + '</span></button>'
        )
      })
    )
    .concat(['<button class="pill pill--add" data-act="add-group" title="新建分组">' + ICON.plus + '</button>'])
    .join('')

  /* 空状态由可见列表推导：有搜索词就是「没找到」，否则才是「还空着」 */
  const mode = vis.length === 0 ? (st.query.trim() ? 'search' : 'group') : null
  const body = mode ? emptyBlock(mode) : '<div class="grid">' + vis.map(function (it) { return tile(it, st) }).join('') + '</div>'

  const selecting = st.selected.length > 0 && !mode
  const groupName = activeGroup ? activeGroup.name : '全部'

  return (
    '<header class="titlebar">' +
    '<span class="titlebar__mark">' + ICON.drawer + '</span>' +
    '<div class="titlebar__text">' +
    '<span class="titlebar__name">收纳盒</span>' +
    '<span class="titlebar__hint">' + total + ' 项 · Ctrl+Shift+Space 呼出</span>' +
    '</div>' +
    '<div class="titlebar__actions">' +
    '<button class="icon-btn ' + (st.pinned ? 'is-on' : '') + '" data-act="pin-win" title="始终置顶">' + ICON.pin + '</button>' +
    '<button class="icon-btn" data-act="settings" title="设置">' + ICON.gear + '</button>' +
    '<button class="icon-btn" data-act="hide" title="收到托盘">' + ICON.minus + '</button>' +
    '</div></header>' +

    '<div class="searchbar"><label class="search">' + ICON.search +
    '<input value="' + escapeHtml(st.query) + '" placeholder="搜索名称、路径、备注，或拼音首字母"' +
    (st.static ? ' disabled' : ' data-live="search"') + ' />' +
    (st.query ? '<button class="search__clear" data-act="clear-q">' + ICON.close + '</button>' : '') +
    '</label><button class="sortbtn ' + (st.arranging ? 'is-on' : '') + '" data-act="sort" title="排序：' + SORT_LABELS[st.sortBy] + '">' + ICON.sort + '</button></div>' +

    '<nav class="tabs"><div class="tabs__scroll">' + tabs + '</div></nav>' +

    body +

    '<footer class="dock">' +
    '<button class="dock-btn" data-act="pick-files">' + ICON.filePlus + '文件</button>' +
    '<button class="dock-btn" data-act="pick-folder">' + ICON.folder + '文件夹</button>' +
    '<button class="dock-btn" data-act="add-link">' + ICON.link + '链接</button>' +
    '<button class="dock-btn" data-act="add-text">' + ICON.text + '片段</button>' +
    '<span class="dock__spacer"></span>' +
    '<span class="dock__stat">' + (vis.length === total ? total : vis.length + ' / ' + total) + '</span>' +
    '</footer>' +

    (selecting
      ? '<div class="selectbar">' +
        '<span class="selectbar__count">已选 ' + st.selected.length + '</span>' +
        '<div class="selectbar__actions">' +
        '<button class="selectbar__btn" data-act="b-open">打开</button>' +
        '<button class="selectbar__btn" data-act="b-pin">' + (st.allPinned ? '取消固定' : '固定') + '</button>' +
        '<button class="selectbar__btn" data-act="b-move">移动</button>' +
        '<button class="selectbar__btn is-danger" data-act="b-remove">移除</button>' +
        '</div>' +
        '<button class="selectbar__link" data-act="b-all">全选</button>' +
        '<button class="selectbar__close" data-act="b-clear">' + ICON.close + '</button>' +
        '</div>'
      : '') +

    (st.sortOpen
      ? '<div class="ctx" style="right: var(--space-4); top: calc(var(--space-12) * 2)">' +
        '<div class="ctx__hint">分组内排序</div>' +
        SORT_IDS.map(function (id) {
          return (
            '<button class="ctx__item ' + (id === st.sortBy ? 'is-current' : '') + '" data-act="set-sort" data-id="' + id + '">' +
            '<span>' + SORT_LABELS[id] + '</span>' + (id === st.sortBy ? '<span class="ctx__tick"></span>' : '') + '</button>'
          )
        }).join('') +
        '<div class="ctx__sep"></div>' +
        '<button class="ctx__item ' + (st.arranging ? 'is-current' : '') + '" data-act="toggle-arrange">' +
        '<span>' + (st.arranging ? '结束拖拽整理' : '拖拽调整顺序') + '</span>' +
        (st.arranging ? '<span class="ctx__tick"></span>' : '') + '</button></div>'
      : '') +

    (st.groupMenu
      ? '<div class="ctx" style="left: var(--space-4); top: calc(var(--space-12) * 2 - var(--space-2))">' +
        '<div class="ctx__hint">窗口放不下时，多余分组收进「更多」</div>' +
        GROUPS.slice(3).map(function (g) {
          return (
            '<button class="ctx__item ' + (g.id === st.group ? 'is-current' : '') + '" data-act="group" data-id="' + g.id + '">' +
            '<span>' + g.name + '</span><span class="ctx__count">' + (cnt[g.id] || 0) + '</span></button>'
          )
        }).join('') +
        '</div>'
      : '') +

    (st.ctxMenu
      ? '<div class="ctx" style="left: var(--space-6); top: calc(var(--space-12) + var(--space-8)); max-width: calc(var(--space-12) * 5)">' +
        '<div class="ctx__hint">右键菜单（线上为系统原生菜单，此处为样式示意）</div>' +
        '<button class="ctx__item" data-act="m-open"><span>打开</span><span class="ctx__count">双击</span></button>' +
        '<button class="ctx__item" data-act="m-pin"><span>' + (st.ctxMenu.pinned ? '取消固定' : '固定到最前') + '</span></button>' +
        '<button class="ctx__item" data-act="m-reveal"><span>在资源管理器中显示</span></button>' +
        '<button class="ctx__item" data-act="m-copy"><span>复制路径</span><span class="ctx__count">Ctrl C</span></button>' +
        '<button class="ctx__item" data-act="m-rename"><span>重命名</span><span class="ctx__count">F2</span></button>' +
        '<div class="ctx__sep"></div>' +
        '<button class="ctx__item is-danger" data-act="m-remove"><span>从盒子移除</span></button>' +
        '</div>'
      : '') +

    (st.sheet
      ? '<div class="scrim" data-act="close-sheet"></div><div class="sheet">' +
        '<div class="sheet__head"><span class="sheet__title">' + (st.sheet === 'link' ? '收一条链接' : '存一段文字') + '</span>' +
        '<span class="sheet__sub">' + (st.sheet === 'link' ? '回车即可收纳' : 'Ctrl + 回车收纳') + '</span></div>' +
        '<div class="field"><span class="field__label">' + (st.sheet === 'link' ? '网址' : '内容') + '</span>' +
        (st.sheet === 'link'
          ? '<input class="field__input" placeholder="https://example.com 或直接粘贴" spellcheck="false"' + (st.static ? ' disabled' : ' data-live="sheet"') + ' />'
          : '<textarea class="field__textarea" placeholder="一段草稿、一行命令、一个常用地址……" spellcheck="false"' + (st.static ? ' disabled' : ' data-live="sheet"') + '></textarea>') +
        '</div>' +
        '<div class="sheet__actions"><button class="btn btn--ghost" data-act="close-sheet">取消</button>' +
        '<button class="btn btn--primary" data-act="submit-sheet">收进盒子</button></div></div>'
      : '') +

    (st.peek
      ? '<div class="scrim" data-act="close-peek"></div>' +
        '<section class="peek" role="dialog" aria-modal="true">' +
        '<header class="peek__head"><h2 class="peek__title">片段预览</h2>' +
        '<span class="peek__count">' + st.peek.target.replace(/\s+/g, ' ').trim().length + ' 字 · ' + st.peek.target.split('\n').length + ' 行</span>' +
        '<button class="peek__close" data-act="close-peek">' + ICON.close + '</button></header>' +
        '<div class="peek__body" tabindex="0">' + escapeHtml(st.peek.target) + '</div>' +
        '<footer class="peek__foot"><button class="btn ' + (st.peek.copied ? 'btn--primary' : 'btn--ghost') + '" data-act="peek-copy">' +
        (st.peek.copied ? '已复制' : '复制全文') + '</button></footer></section>'
      : '') +

    (st.drop
      ? '<div class="dropzone">' + ICON.down +
        '<span class="dropzone__label">松手收进「' + groupName + '」</span>' +
        '<span class="dropzone__hint">文件与文件夹只记路径，不会被移动</span></div>'
      : '') +

    (st.toast ? '<div class="toast ' + (st.toast.tone === 'warn' ? 'is-warn' : '') + '">' + st.toast.text + '</div>' : '') +

    (st.settingsOpen ? settingsBlock(st) : '')
  )
}

function tile(item, st) {
  const cls = [
    'tile',
    st.selected.includes(item.id) ? 'is-selected' : '',
    item.exists ? '' : 'is-missing',
    item.pinned ? 'is-pinned' : '',
    st.arranging ? 'is-arranging' : '',
    st.dragging === item.id ? 'is-dragging' : ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    '<button class="' + cls + '" data-id="' + item.id + '"' +
    (st.arranging && !item.pinned ? ' draggable="true"' : '') +
    ' title="' + escapeHtml(item.title + '\n' + item.target) + '">' +
    (item.pinned ? '<span class="tile__pin">' + ICON.pin + '</span>' : '') +
    '<span class="tile__visual">' + glyphFor(item) + '</span>' +
    '<span class="tile__name">' + escapeHtml(item.title) + '</span>' +
    '<span class="tile__meta">' + metaOf(item) + '</span>' +
    (st.selected.includes(item.id) ? '<span class="tile__check"></span>' : '') +
    '</button>'
  )
}

function emptyBlock(mode) {
  if (mode === 'search') {
    return (
      '<div class="empty">' + ICON.empty +
      '<span class="empty__title">没找到匹配的东西</span>' +
      '<span class="empty__desc">换个关键词试试，或者清空搜索框看看全部。</span>' +
      '<div class="empty__quick"><button class="chip-btn" data-act="clear-q">清空搜索</button></div></div>'
    )
  }
  return (
    '<div class="empty">' + ICON.empty +
    '<span class="empty__title">把东西直接拖进来</span>' +
    '<span class="empty__desc">桌面上的文件、文件夹、浏览器里的链接、随手一段文字，拖进这个窗口就收好了。双击打开，右键还有更多操作。</span>' +
    '<div class="empty__quick">' +
    '<button class="chip-btn" data-act="pick-files">选文件</button>' +
    '<button class="chip-btn" data-act="pick-folder">选文件夹</button>' +
    '<button class="chip-btn" data-act="add-link">存链接</button>' +
    '<button class="chip-btn" data-act="add-text">存片段</button>' +
    '</div></div>'
  )
}

function row(name, desc, ctrl) {
  return (
    '<div class="row"><div class="row__label"><div class="row__name">' + name + '</div>' +
    '<div class="row__desc">' + desc + '</div></div>' + ctrl + '</div>'
  )
}

const THEME_SW = [
  { id: 'wood', name: '暖木', sw: 'color-mix(in oklab, var(--warn), var(--danger) 22%)' },
  { id: 'night', name: '夜墨', sw: 'color-mix(in oklab, var(--fg), var(--accent) 20%)' },
  { id: 'celadon', name: '青瓷', sw: 'color-mix(in oklab, var(--success), var(--meta) 34%)' },
  { id: 'indigo', name: '靛蓝', sw: 'var(--accent)' }
]

function settingsBlock(st) {
  const s = st.settings
  const u = st.update
  const pct = Math.round(s.opacity * 100)
  return (
    '<section class="settings">' +
    '<header class="settings__head"><span class="settings__title">设置</span>' +
    '<button class="icon-btn" data-act="close-settings">' + ICON.close + '</button></header>' +

    '<div class="settings__body">' +

    '<div class="settings__group"><div class="settings__group-label">窗口</div>' +
    row('始终置顶', '面板浮在所有窗口之上', '<button class="switch ' + (s.alwaysOnTop ? 'is-on' : '') + '" data-toggle="alwaysOnTop"></button>') +
    row('失焦收起', '点到窗口外面就收进托盘', '<button class="switch ' + (s.hideOnBlur ? 'is-on' : '') + '" data-toggle="hideOnBlur"></button>') +
    row('面板不透明度', '下限 78%，再透就压在壁纸上读不清',
      '<span class="alpha"><input type="range" min="0.78" max="1" step="0.02" value="' + s.opacity + '"' +
      (st.static ? ' disabled' : ' data-live="alpha"') + ' />' + pct + '%</span>') +
    row('卡片尺寸', '紧凑模式一屏多看两列',
      '<div class="seg"><button class="' + (s.density === 'compact' ? 'is-on' : '') + '" data-density-pick="compact">紧凑</button>' +
      '<button class="' + (s.density === 'comfortable' ? 'is-on' : '') + '" data-density-pick="comfortable">舒适</button></div>') +
    row('面板配色', '同一玻璃基座上的强调色重映射', '<div class="themes">' +
      THEME_SW.map(function (t) {
        return '<button class="theme-chip ' + (s.theme === t.id ? 'is-on' : '') + '" data-theme-pick="' + t.id + '" style="--sw:' + t.sw + '"><i></i>' + t.name + '</button>'
      }).join('') +
      '</div>') +
    '</div>' +

    '<div class="settings__group"><div class="settings__group-label">快捷键</div>' +
    row('呼出 / 收起', s.activeHotkey ? '当前生效' : '注册失败：可能被其他应用占用',
      '<button class="hotkey ' + (s.capturing ? 'is-busy' : '') + '">' + (s.capturing ? '按下组合键…' : prettyHotkey(s.hotkey)) + '</button>') +
    '</div>' +

    '<div class="settings__group"><div class="settings__group-label">更新</div>' +
    '<div class="update-card ' + (u.alert ? 'is-alert' : '') + '"><div class="update-card__info">' +
    '<div class="update-card__version">v' + u.current + '</div>' +
    '<div class="update-card__status ' + (u.alert ? 'is-alert' : '') + '">' + u.text + '</div>' +
    (u.status === 'downloading' ? '<div class="update-card__bar"><i style="width:' + u.percent + '%"></i></div>' : '') +
    '</div><button class="btn ' + (u.alert ? 'btn--primary' : 'btn--ghost') + '">' + u.button + '</button></div>' +
    row('后台检查更新', '启动 6 秒后查一次，之后每 6 小时', '<button class="switch ' + (s.autoCheckUpdate ? 'is-on' : '') + '" data-toggle="autoCheckUpdate"></button>') +
    row('自动下载更新', 'GitHub 带宽有限时建议改成手动点', '<button class="switch ' + (s.autoDownloadUpdate ? 'is-on' : '') + '" data-toggle="autoDownloadUpdate"></button>') +
    '</div>' +

    '<div class="settings__group"><div class="settings__group-label">数据</div>' +
    row('导出备份', '存成一个 JSON，换机器时搬过去', '<button class="btn btn--ghost">导出</button>') +
    row('从备份恢复', '会用备份整体覆盖当前盒子', '<button class="btn btn--ghost">恢复</button>') +
    '</div>' +

    '<div class="settings__foot">数据只存在这台电脑上，不上传任何服务器<br />更新包只从 GitHub Release 拉取</div>' +
    '</div></section>'
  )
}

/* ==========================================================================
   活窗口
   ========================================================================== */

const liveEl = document.getElementById('live-window')

const st = {
  group: null,
  query: '',
  sortBy: 'recent',
  selected: [],
  anchorId: null,
  allPinned: false,
  arranging: false,
  sortOpen: false,
  groupMenu: false,
  ctxMenu: null,
  sheet: null,
  peek: null,
  drop: false,
  toast: null,
  settingsOpen: false,
  dragging: null,
  pinned: true,
  static: false,
  settings: {
    alwaysOnTop: true,
    hideOnBlur: false,
    launchAtLogin: false,
    hotkey: 'Control+Shift+Space',
    opacity: 0.96,
    density: 'comfortable',
    theme: 'indigo',
    autoCheckUpdate: true,
    autoDownloadUpdate: false,
    activeHotkey: 'Control+Shift+Space',
    capturing: false
  },
  update: {
    current: '0.3.1',
    status: 'latest',
    text: '已是最新版本',
    button: '检查更新',
    alert: false,
    percent: 0
  }
}

let toastTimer = null

function draw() {
  liveEl.dataset.theme = st.settings.theme
  liveEl.dataset.density = st.settings.density
  liveEl.style.setProperty('--panel-alpha', st.settings.opacity)
  liveEl.innerHTML = render(st)
}

function notify(text, tone) {
  st.toast = { text: text, tone: tone || 'ok' }
  draw()
  clearTimeout(toastTimer)
  toastTimer = setTimeout(function () {
    st.toast = null
    draw()
  }, 2400)
}

function selectedVisible(vis) {
  const ids = new Set(vis.map(function (i) { return i.id }))
  return st.selected.filter(function (id) { return ids.has(id) })
}

function removeIds(ids) {
  ids.forEach(function (id) {
    const idx = ITEMS.findIndex(function (i) { return i.id === id })
    if (idx > -1) ITEMS.splice(idx, 1)
  })
}

function findItem(id) {
  return ITEMS.find(function (i) { return i.id === id })
}

liveEl.addEventListener('click', function (e) {
  const tileEl = e.target.closest('.tile')
  const act = e.target.closest('[data-act]')
  const tog = e.target.closest('[data-toggle]')
  const den = e.target.closest('[data-density-pick]')
  const tp = e.target.closest('[data-theme-pick]')
  const vis = visibleItems(st)

  if (tog) {
    st.settings[tog.dataset.toggle] = !st.settings[tog.dataset.toggle]
    draw()
    return
  }
  if (den) {
    st.settings.density = den.dataset.densityPick
    draw()
    return
  }
  if (tp) {
    st.settings.theme = tp.dataset.themePick
    notify('已切换到「' + THEME_NAMES[tp.dataset.themePick] + '」')
    return
  }

  if (act) {
    const a = act.dataset.act
    st.sortOpen = false
    st.groupMenu = false

    if (a === 'group') {
      st.group = act.dataset.id === '__all__' ? null : act.dataset.id
      st.selected = []
      draw()
      return
    }
    if (a === 'add-group') return notify('演示原型：新建分组走 group:add')
    if (a === 'clear-q') {
      st.query = ''
      draw()
      return
    }
    if (a === 'sort') {
      st.sortOpen = !st.sortOpen
      st.ctxMenu = null
      draw()
      return
    }
    if (a === 'set-sort') {
      st.sortBy = act.dataset.id
      notify('排序：' + SORT_LABELS[st.sortBy])
      return
    }
    if (a === 'toggle-arrange') {
      st.arranging = !st.arranging
      st.sortOpen = false
      notify(st.arranging ? '整理模式：拖拽卡片调整顺序' : '已退出整理模式，可继续拖到资源管理器')
      return
    }
    if (a === 'settings') {
      st.settingsOpen = true
      draw()
      return
    }
    if (a === 'close-settings') {
      st.settingsOpen = false
      draw()
      return
    }
    if (a === 'pin-win') {
      st.pinned = !st.pinned
      return notify(st.pinned ? '已始终置顶' : '已取消置顶')
    }
    if (a === 'hide') return notify('已收到托盘（示意）')
    if (a === 'pick-files' || a === 'pick-folder') return notify('演示原型：此处唤起系统文件对话框')
    if (a === 'add-link') { st.sheet = 'link'; draw(); return }
    if (a === 'add-text') { st.sheet = 'text'; draw(); return }
    if (a === 'close-sheet') { st.sheet = null; draw(); return }
    if (a === 'submit-sheet') {
      const input = liveEl.querySelector('[data-live="sheet"]')
      const value = (input && input.value.trim()) || ''
      if (!value) return notify('还没填内容', 'warn')
      const kind = st.sheet === 'link' ? 'link' : 'text'
      ITEMS.push(
        mk(
          'i' + (ITEMS.length + 1),
          kind,
          kind === 'link' ? hostOf(value) : value.slice(0, 12),
          value,
          st.group && st.group !== FREQUENT_ID ? st.group : GROUPS[0].id,
          '',
          false,
          '',
          0,
          0,
          0
        )
      )
      st.sheet = null
      notify('已收进盒子')
      return
    }
    if (a === 'close-peek') { st.peek = null; draw(); return }
    if (a === 'peek-copy') {
      st.peek = { target: st.peek.target, copied: true }
      return notify('已复制到剪贴板')
    }
    if (a === 'b-open') return notify('正在打开 ' + selectedVisible(vis).length + ' 项')
    if (a === 'b-pin') {
      const ids = selectedVisible(vis)
      const on = !(ids.length > 0 && ids.every(function (id) { return findItem(id).pinned }))
      ids.forEach(function (id) { findItem(id).pinned = on })
      return notify(on ? '已固定到最前' : '已取消固定')
    }
    if (a === 'b-move') return notify('演示原型：移动到其它分组走 item:update-many')
    if (a === 'b-remove') {
      const ids = selectedVisible(vis)
      removeIds(ids)
      st.selected = []
      return notify('已移除 ' + ids.length + ' 项记录，原文件未动')
    }
    if (a === 'b-all') {
      st.selected = vis.map(function (i) { return i.id })
      draw()
      return
    }
    if (a === 'b-clear') {
      st.selected = []
      draw()
      return
    }
    if (a === 'm-open') {
      st.ctxMenu = null
      return notify('演示原型：打开走 item:open')
    }
    if (a === 'm-pin') {
      const it = findItem(st.ctxMenu.id)
      it.pinned = !it.pinned
      st.ctxMenu = null
      return notify(it.pinned ? '已固定到最前' : '已取消固定')
    }
    if (a === 'm-reveal' || a === 'm-copy' || a === 'm-rename') {
      st.ctxMenu = null
      return notify('演示原型：该操作由主进程执行')
    }
    if (a === 'm-remove') {
      removeIds([st.ctxMenu.id])
      st.ctxMenu = null
      return notify('已移除记录，原文件未动')
    }
    draw()
    return
  }

  if (tileEl) {
    const id = tileEl.dataset.id
    const item = findItem(id)
    if (e.metaKey || e.ctrlKey) {
      st.selected = st.selected.includes(id)
        ? st.selected.filter(function (x) { return x !== id })
        : st.selected.concat([id])
      st.anchorId = id
    } else if (e.shiftKey && st.anchorId) {
      const ids = vis.map(function (i) { return i.id })
      const a2 = ids.indexOf(st.anchorId)
      const b2 = ids.indexOf(id)
      if (a2 > -1 && b2 > -1) st.selected = ids.slice(Math.min(a2, b2), Math.max(a2, b2) + 1)
    } else {
      st.anchorId = id
      if (st.arranging) return
      notify(item.title + ' · ' + ago(item.lastOpenedAt) + '打开 · 共 ' + item.openCount + ' 次')
      return
    }
    const sel = selectedVisible(vis)
    st.allPinned = sel.length > 0 && sel.every(function (sid) { return findItem(sid).pinned })
    draw()
  }
})

liveEl.addEventListener('dblclick', function (e) {
  const tileEl = e.target.closest('.tile')
  if (!tileEl) return
  const item = findItem(tileEl.dataset.id)
  if (item.kind === 'text') {
    st.peek = { target: item.target, copied: false }
    draw()
  } else if (!item.exists) {
    notify('路径失效：原文件可能已被移动或删除', 'warn')
  } else {
    notify('正在打开「' + item.title + '」')
  }
})

liveEl.addEventListener('contextmenu', function (e) {
  const tileEl = e.target.closest('.tile')
  if (!tileEl) return
  e.preventDefault()
  const item = findItem(tileEl.dataset.id)
  /* 右键先清空多选：这是现有版本的手感 */
  st.selected = []
  st.ctxMenu = { id: item.id, pinned: item.pinned }
  draw()
})

liveEl.addEventListener('input', function (e) {
  if (e.target.dataset.live === 'search') {
    st.query = e.target.value
    draw()
    const input = liveEl.querySelector('[data-live="search"]')
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }
  if (e.target.dataset.live === 'alpha') {
    st.settings.opacity = Math.min(1, Math.max(OPACITY_MIN, Number(e.target.value)))
    draw()
  }
})

/* 整理模式：拖拽换位。拖拽过程中只改 class，不重绘，避免打断 HTML5 拖放 */
liveEl.addEventListener('dragstart', function (e) {
  const tileEl = e.target.closest('.tile')
  if (!tileEl || !st.arranging) return
  st.dragging = tileEl.dataset.id
  tileEl.classList.add('is-dragging')
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', st.dragging)
})

liveEl.addEventListener('dragover', function (e) {
  if (!st.arranging) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
})

liveEl.addEventListener('drop', function (e) {
  const tileEl = e.target.closest('.tile')
  if (!st.arranging || !tileEl || !st.dragging) return
  e.preventDefault()
  const from = ITEMS.findIndex(function (i) { return i.id === st.dragging })
  const to = ITEMS.findIndex(function (i) { return i.id === tileEl.dataset.id })
  st.dragging = null
  if (from < 0 || to < 0 || from === to) {
    draw()
    return
  }
  const moved = ITEMS.splice(from, 1)[0]
  ITEMS.splice(to, 0, moved)
  ITEMS.forEach(function (it, idx) { it.order = idx })
  if (st.sortBy !== 'custom') {
    st.sortBy = 'custom'
    notify('已切到「手动整理」，按拖出来的顺序显示')
  } else {
    notify('顺序已更新（一次 IPC + 一次落盘）')
  }
})

liveEl.addEventListener('dragend', function () {
  st.dragging = null
  draw()
})

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    if (st.peek || st.sheet || st.settingsOpen || st.ctxMenu || st.sortOpen || st.selected.length) {
      st.peek = null
      st.sheet = null
      st.ctxMenu = null
      st.sortOpen = false
      st.settingsOpen = false
      st.selected = []
      draw()
    }
    return
  }
  const tag = document.activeElement ? document.activeElement.tagName : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    st.selected = visibleItems(st).map(function (i) { return i.id })
    draw()
  }
  if (e.key === 'Delete' && st.selected.length) {
    const ids = selectedVisible(visibleItems(st))
    removeIds(ids)
    st.selected = []
    notify('已移除 ' + ids.length + ' 项记录，原文件未动')
  }
})

draw()

/* ==========================================================================
   状态快照：与活窗口共用同一个 render()，只换 state
   ========================================================================== */

const base = {
  group: 'g-work',
  query: '',
  sortBy: 'recent',
  selected: [],
  anchorId: null,
  allPinned: false,
  arranging: false,
  sortOpen: false,
  groupMenu: false,
  ctxMenu: null,
  sheet: null,
  peek: null,
  drop: false,
  toast: null,
  settingsOpen: false,
  dragging: null,
  pinned: true,
  static: true,
  settings: Object.assign({}, st.settings),
  update: Object.assign({}, st.update)
}

function withSettings(patch) {
  return Object.assign({}, base.settings, patch)
}

const SHOTS = [
  {
    label: '空分组',
    tag: 'empty',
    desc: '首次启动不放示例项：写死的路径在别人机器上必然失效，比空着更劝退。',
    hideGroup: 'g-home',
    state: Object.assign({}, base, { group: 'g-home' })
  },
  {
    label: '搜索无结果',
    tag: 'search',
    desc: '匹配名称、路径、备注；纯字母数字时额外走拼音首字母，输入 zbmb 也能命中「周报模板」。',
    state: Object.assign({}, base, { query: 'zzzz' })
  },
  {
    label: '多选批量条',
    tag: 'selection',
    desc: 'Ctrl 加选、Shift 连选；批量只作用于「已选 ∩ 当前可见」，一次 IPC 落盘。',
    state: Object.assign({}, base, { selected: ['i1', 'i2', 'i4'] })
  },
  {
    label: '右键菜单',
    tag: 'context',
    desc: '右键先清空多选再出菜单；线上是系统原生菜单，这里把菜单项与快捷键对齐呈现。',
    state: Object.assign({}, base, { ctxMenu: { id: 'i1', pinned: true } })
  },
  {
    label: '排序菜单',
    tag: 'sort',
    desc: '四种排序加一个「拖拽调整顺序」开关；「手动整理」是顺序，「拖拽整理」是动作。',
    state: Object.assign({}, base, { sortOpen: true, sortBy: 'opened' })
  },
  {
    label: '整理模式',
    tag: 'arranging',
    desc: '整理中卡片只换位、不拖出到资源管理器；固定项用灰点标识、不参与排序。',
    state: Object.assign({}, base, { arranging: true, sortBy: 'custom' })
  },
  {
    label: '路径失效',
    tag: 'missing',
    desc: '原文件被挪走时转红色虚线态并标注「路径失效」，不静默消失，仍可移除记录。',
    state: Object.assign({}, base, { group: null, toast: { text: '路径失效：原文件可能已被移动或删除', tone: 'warn' } })
  },
  {
    label: '拖入投放',
    tag: 'drop',
    desc: '外部文件拖入时整窗出现投放区，明确写入目标分组；只记路径，不搬文件。',
    state: Object.assign({}, base, { drop: true, group: 'g-inbox' })
  },
  {
    label: '片段预览',
    tag: 'peek',
    desc: '片段双击先看内容再决定复制；弹窗内 Esc、点遮罩都能关，复制给明确回执。',
    state: Object.assign({}, base, { peek: { target: findItem('i4').target, copied: false } })
  },
  {
    label: '收一条链接',
    tag: 'sheet',
    desc: '底部弹层而非新窗口；回车即收纳，落点跟随当前分组。',
    state: Object.assign({}, base, { sheet: 'link' })
  },
  {
    label: '分组收纳',
    tag: 'more',
    desc: '窗口宽度有限，放不下的胶囊自动收进「更多」，下拉里仍带各自计数。',
    state: Object.assign({}, base, { groupMenu: true, group: 'g-read' })
  }
]

document.getElementById('shots').innerHTML = SHOTS.map(function (shot) {
  let html
  if (shot.hideGroup) {
    const moved = ITEMS.filter(function (i) { return i.groupId === shot.hideGroup })
    moved.forEach(function (i) { i.groupId = '__hidden__' })
    html = render(shot.state)
    moved.forEach(function (i) { i.groupId = shot.hideGroup })
  } else {
    html = render(shot.state)
  }
  return shotCard(shot, html, base.settings.theme, base.settings.density, base.settings.opacity)
}).join('')

const SETTINGS_SHOTS = [
  {
    label: '设置面板',
    tag: 'settings',
    desc: '窗口、快捷键、更新、数据四组；不透明度滑块实时改 --panel-alpha，并被夹在 78%–100%。',
    state: Object.assign({}, base, { settingsOpen: true })
  },
  {
    label: '发现新版本',
    tag: 'available',
    desc: '发现新版后卡片上强调，按钮从「检查更新」变「下载更新」；已下载则变「重启安装」。',
    state: Object.assign({}, base, {
      settingsOpen: true,
      update: { current: '0.3.1', status: 'available', text: '发现新版本 0.3.2', button: '下载更新', alert: true, percent: 0 }
    })
  },
  {
    label: '下载中',
    tag: 'downloading',
    desc: '进度条只在 downloading 状态出现；慢网络下可关掉自动下载，改为手动点。',
    state: Object.assign({}, base, {
      settingsOpen: true,
      update: { current: '0.3.1', status: 'downloading', text: '正在下载 0.3.2 62%', button: '下载中…', alert: false, percent: 62 }
    })
  },
  {
    label: '夜墨 · 紧凑',
    tag: 'night',
    desc: '暗色档同样只用 token 混出：底色压深、描边转亮、文字转浅，不引入新色值。',
    state: Object.assign({}, base, { settings: withSettings({ theme: 'night', density: 'compact', opacity: 0.9 }) })
  },
  {
    label: '暖木 · 舒适',
    tag: 'wood',
    desc: '强调色重映射到暖端，文件夹与压缩包的色相随之偏移，玻璃基座保持不变。',
    state: Object.assign({}, base, { settings: withSettings({ theme: 'wood' }) })
  },
  {
    label: '青瓷 · 常用',
    tag: 'celadon',
    desc: '「常用」是虚拟分组：按打开次数取前 10，不落盘、不占真实分组，因此也不可删除。',
    state: Object.assign({}, base, { group: FREQUENT_ID, settings: withSettings({ theme: 'celadon' }) })
  }
]

document.getElementById('settings-shots').innerHTML = SETTINGS_SHOTS.map(function (shot) {
  const s = shot.state.settings
  return shotCard(shot, render(shot.state), s.theme, s.density, s.opacity)
}).join('')

function shotCard(shot, html, theme, density, alpha) {
  return (
    '<article class="shot">' +
    '<div class="shot__frame"><div class="win win--shot" data-theme="' + theme + '" data-density="' + density +
    '" style="--panel-alpha:' + alpha + '">' + html + '</div></div>' +
    '<div><div class="shot__label"><h3>' + shot.label + '</h3><span>' + shot.tag + '</span></div>' +
    '<p class="shot__desc">' + shot.desc + '</p></div></article>'
  )
}
