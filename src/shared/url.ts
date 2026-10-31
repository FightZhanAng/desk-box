export function normalizeUrl(raw: string): string {
  const text = raw.trim()
  if (!text) return text
  // 已经带了协议（https:、mailto:、file: …）就原样用
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) return text
  return `https://${text}`
}

export function hostOf(raw: string): string {
  try {
    return new URL(normalizeUrl(raw)).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

/** 判断拖进来的一段文字看起来像不像网址 */
export function looksLikeUrl(raw: string): boolean {
  const text = raw.trim()
  if (!text || /\s/.test(text)) return false
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) return true
  return /^[\w-]+(\.[\w-]+)+(\/[^\s]*)?$/.test(text)
}

/** 卡片副标题：链接显示域名，文本显示字数，文件显示类型 */
export function subtitleFor(kind: string, target: string): string {
  if (kind === 'link') return hostOf(target) || target
  if (kind === 'text') {
    const chars = target.replace(/\s+/g, ' ').length
    return `${chars} 字`
  }
  return ''
}
