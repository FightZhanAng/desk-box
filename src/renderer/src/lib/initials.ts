import { pinyin } from 'pinyin-pro'

/**
 * 名称的拼音首字母串，用于「输入 w 就能搜到微信」这种打法。
 *
 * 只保留字母和数字：标点、空格、全角符号在拼音里会被原样吐出来，
 * 拼进检索串反而制造出搜不到的缝隙（「微信」变成 "w x" 就匹配不上 "wx"）。
 *
 * 结果按原文缓存：搜索是逐键触发的，同一条目在一次会话里会被算几十遍，
 * 而拼音转换是这里唯一有点开销的地方。
 */
const cache = new Map<string, string>()
const CACHE_LIMIT = 4000

export function initialsOf(text: string): string {
  if (!text) return ''
  const hit = cache.get(text)
  if (hit !== undefined) return hit

  let value = ''
  try {
    const parts = pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' })
    value = parts.join('').toLowerCase().replace(/[^a-z0-9]/g, '')
  } catch {
    // 极端输入（超长文本、异常字符）让 pinyin 抛错时，退化成原串小写，
    // 至少不丢「英文名还能按原样搜」这条
    value = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  // 无上限的缓存就是内存泄漏：名称会随着用户改名不断新增
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(text, value)
  return value
}

/** 纯字母数字的查询才走首字母匹配，避免把中文串也拿去比 */
export function isInitialsQuery(keyword: string): boolean {
  return keyword.length > 0 && /^[a-z0-9]+$/.test(keyword)
}
