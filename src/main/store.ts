import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createDefaultData, normalizeData } from '../shared/defaults'
import type { AppData } from '../shared/types'

let cache: AppData | null = null
let flushTimer: NodeJS.Timeout | null = null

export function dataFile(): string {
  return join(app.getPath('userData'), 'desk-box.json')
}

/** 读一次并常驻内存；后续所有读写都基于这份缓存，避免频繁磁盘 IO */
export function getData(): AppData {
  if (cache) return cache

  const file = dataFile()
  try {
    if (existsSync(file)) {
      cache = normalizeData(JSON.parse(readFileSync(file, 'utf8')))
    } else {
      cache = createDefaultData()
    }
  } catch {
    // 文件损坏时先留一份原样备份，再重建默认数据。
    // 直接覆盖等于把用户几个月攒的东西一次抹掉，宁可多留一个 .broken 文件。
    try {
      if (existsSync(file)) renameSync(file, `${file}.broken-${Date.now()}`)
    } catch {
      /* 备份失败也不能挡住启动 */
    }
    cache = createDefaultData()
  }
  return cache
}

/** 改数据 + 落盘，返回改完的数据 */
export function mutate(fn: (data: AppData) => void): AppData {
  const data = getData()
  fn(data)
  save(data)
  return data
}

/** 防抖写盘：拖动窗口、连续改名这类高频操作不能每次都写文件 */
export function save(data: AppData, immediate = false): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (immediate) {
    writeNow(data)
    return
  }
  flushTimer = setTimeout(() => {
    flushTimer = null
    writeNow(data)
  }, 200)
}

/** 用导入的备份整体替换现有数据 */
export function replaceData(next: unknown): void {
  cache = normalizeData(next)
  save(cache, true)
}

export function flushNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (cache) writeNow(cache)
}

function writeNow(data: AppData): void {
  const file = dataFile()
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // 先写临时文件再 rename：中途断电/崩溃时原文件仍然完整，
  // 不会出现半个 JSON 导致下次启动全部数据丢失。
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}
