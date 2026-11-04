/**
 * Windows 图标提取（纯 JS，无子进程、无原生模块）。
 *
 * 为什么不用 app.getFileIcon：
 *   1. 它只认「文件 → 索引 0」，快捷方式 IconLocation 里的索引（如 quark.exe,8）被丢弃；
 *   2. 对带 PNG 压缩帧的 exe、以及自定义 .ico，它经常直接返回通用占位图；
 *   3. 对 .ico 它返回的是「图片文件」的白纸图标，而不是 ico 里的图像。
 *
 * 这里按 Windows 自己的规则来：
 *   - .ico：直接解析 ICO 容器，按目标尺寸选帧（PNG 帧与 DIB 帧都支持）
 *   - .exe/.dll：解析 PE 资源。优先 RT_GROUP_ICON（按索引选组、组内按尺寸选帧）；
 *     没有组时退化为按 RT_ICON 独立帧
 *
 * 选帧策略与资源管理器一致：优先精确尺寸，其次不超过目标尺寸的最大帧。
 */

import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs'
import { nativeImage } from 'electron'
import type { NativeImage } from 'electron'

const PNG_MAGIC = 0x89504e47

/* ------------------------------------------------------------------ PE 解析 */

interface PESection {
  va: number
  vs: number
  raw: number
  rawSize: number
}

interface PE {
  buf: Buffer
  sections: PESection[]
  rsrcRaw: number
}

interface ResourceEntry {
  nameId: number
  lang: number
  dataRva: number
  size: number
}

/** 从文件里按字节区间读取；越界部分自动裁掉 */
function readRange(fd: number, start: number, length: number, fileSize: number): Buffer {
  const size = Math.max(0, Math.min(length, fileSize - start))
  if (size <= 0) return Buffer.alloc(0)
  const out = Buffer.alloc(size)
  let filled = 0
  while (filled < size) {
    const got = readSync(fd, out, filled, size - filled, start + filled)
    if (got <= 0) break
    filled += got
  }
  return filled === size ? out : out.subarray(0, filled)
}

function readHead(file: string, length: number): Buffer | null {
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch {
    return null
  }
  try {
    return readRange(fd, 0, length, fstatSync(fd).size)
  } catch {
    return null
  } finally {
    closeSync(fd)
  }
}

/**
 * 打开 PE 文件，只把资源节（.rsrc）读进内存。
 *
 * 之前是 readFileSync 整个文件：图标只需要资源节里的几 MB，而 Steam / VS Code
 * 这类 exe 动辄一两百 MB，几十个快捷方式连着读会把主线程堵上一两秒。
 *
 * 资源目录里的 RVA 全部落在 .rsrc 内，所以把节内偏移当作文件偏移重新建一张
 * 「只有这一节」的映射表，后面的目录遍历和帧解码代码完全不用改。
 */
function openResourceSection(file: string): PE | null {
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch {
    return null
  }

  try {
    const fileSize = fstatSync(fd).size
    // 头部（DOS 头 + COFF + 可选头 + 节表）通常不到 2KB，读 8KB 足够
    const head = readRange(fd, 0, 8192, fileSize)
    if (head.length < 0x40 || head.readUInt16LE(0) !== 0x5a4d) return null
    const peOff = head.readUInt32LE(0x3c)
    if (peOff + 24 > head.length || head.readUInt32LE(peOff) !== 0x4550) return null

    const nSec = head.readUInt16LE(peOff + 6)
    const optSize = head.readUInt16LE(peOff + 20)
    const optOff = peOff + 24
    if (optOff >= head.length) return null
    const magic = head.readUInt16LE(optOff)
    // PE32 与 PE32+ 的 data directory 起始偏移不同
    const ddOff = optOff + (magic === 0x20b ? 112 : 96)
    if (ddOff + 20 > head.length) return null
    const rsrcRva = head.readUInt32LE(ddOff + 16)
    if (!rsrcRva) return null

    const secOff = optOff + optSize
    for (let i = 0; i < nSec; i++) {
      const s = secOff + i * 40
      if (s + 40 > head.length) break
      const sec: PESection = {
        va: head.readUInt32LE(s + 12),
        vs: head.readUInt32LE(s + 8),
        raw: head.readUInt32LE(s + 20),
        rawSize: head.readUInt32LE(s + 16)
      }
      if (rsrcRva < sec.va || rsrcRva >= sec.va + Math.max(sec.vs, sec.rawSize, 1)) continue

      const within = rsrcRva - sec.va
      const start = sec.raw + within
      const avail = Math.min(sec.rawSize - within, fileSize - start)
      if (avail <= 0) return null
      const rsrc = readRange(fd, start, avail, fileSize)
      if (rsrc.length < 16) return null

      return {
        buf: rsrc,
        sections: [{ va: rsrcRva, vs: avail, raw: 0, rawSize: avail }],
        rsrcRaw: 0
      }
    }
    return null
  } catch {
    return null
  } finally {
    closeSync(fd)
  }
}

function rvaToOffset(pe: PE, rva: number): number {
  for (const sec of pe.sections) {
    if (rva >= sec.va && rva < sec.va + Math.max(sec.vs, sec.rawSize, 1)) {
      return sec.raw + (rva - sec.va)
    }
  }
  return 0
}

interface DirTable {
  named: number
  ids: number
  base: number
}

function readDir(pe: PE, off: number): DirTable {
  return {
    named: pe.buf.readUInt16LE(off + 12),
    ids: pe.buf.readUInt16LE(off + 14),
    base: off + 16
  }
}

/** 取某资源类型（14=GROUP_ICON，3=ICON）下的所有条目 */
function entriesOfType(pe: PE, typeId: number): ResourceEntry[] {
  const out: ResourceEntry[] = []
  const root = readDir(pe, pe.rsrcRaw)

  for (let i = 0; i < root.named + root.ids; i++) {
    const e = root.base + i * 8
    if (e + 8 > pe.buf.length) break
    const nameId = pe.buf.readUInt32LE(e)
    const child = pe.buf.readUInt32LE(e + 4)
    // 命名资源（字符串名）跳过：图标类型永远是数字 id
    if (nameId & 0x80000000) continue
    if ((nameId & 0xffff) !== typeId) continue
    if (!(child & 0x80000000)) continue

    const typeDir = readDir(pe, pe.rsrcRaw + (child & 0x7fffffff))
    for (let j = 0; j < typeDir.named + typeDir.ids; j++) {
      const e2 = typeDir.base + j * 8
      if (e2 + 8 > pe.buf.length) break
      const resName = pe.buf.readUInt32LE(e2)
      const child2 = pe.buf.readUInt32LE(e2 + 4)
      if (resName & 0x80000000) continue
      if (!(child2 & 0x80000000)) continue

      const nameDir = readDir(pe, pe.rsrcRaw + (child2 & 0x7fffffff))
      for (let k = 0; k < nameDir.named + nameDir.ids; k++) {
        const e3 = nameDir.base + k * 8
        if (e3 + 8 > pe.buf.length) break
        const lang = pe.buf.readUInt32LE(e3)
        const child3 = pe.buf.readUInt32LE(e3 + 4)
        if (child3 & 0x80000000) continue

        const dataEntry = pe.rsrcRaw + (child3 & 0x7fffffff)
        out.push({
          nameId: resName & 0xffff,
          lang: lang & 0xffff,
          dataRva: pe.buf.readUInt32LE(dataEntry),
          size: pe.buf.readUInt32LE(dataEntry + 4)
        })
      }
    }
  }
  return out
}

interface GroupFrame {
  width: number
  height: number
  bitCount: number
  bytes: number
  nId: number
}

function parseGroupFrames(pe: PE, entry: ResourceEntry): GroupFrame[] {
  const off = rvaToOffset(pe, entry.dataRva)
  if (off <= 0 || off + 6 > pe.buf.length) return []
  const count = pe.buf.readUInt16LE(off + 4)
  const frames: GroupFrame[] = []
  for (let i = 0; i < count; i++) {
    const e = off + 6 + i * 14
    if (e + 14 > pe.buf.length) break
    frames.push({
      // 0 表示 256：ICO/GRPICONDIR 用单字节存尺寸
      width: pe.buf.readUInt8(e) || 256,
      height: pe.buf.readUInt8(e + 1) || 256,
      bitCount: pe.buf.readUInt16LE(e + 6),
      bytes: pe.buf.readUInt32LE(e + 8),
      nId: pe.buf.readUInt16LE(e + 12)
    })
  }
  return frames
}

/* ------------------------------------------------------------------ 位图解码 */

/**
 * DIB（BITMAPINFOHEADER）转 BGRA。
 * 图标里的 DIB 是「XOR 位图 + AND 掩码」两段，高度写的是两倍，要除以 2。
 */
function dibToBitmap(
  buf: Buffer,
  bitCount: number
): { width: number; height: number; buffer: Buffer } | null {
  if (buf.length < 40) return null
  const headerSize = buf.readUInt32LE(0)
  const biWidth = buf.readInt32LE(4)
  const biHeight = buf.readInt32LE(8)
  const biBitCount = buf.readUInt16LE(14)
  const compression = buf.readUInt32LE(16)
  if (compression !== 0) return null // 只处理 BI_RGB

  const w = Math.abs(biWidth)
  const h = Math.abs(biHeight) / 2
  if (w <= 0 || h <= 0 || w > 1024 || h > 1024) return null

  const colorsUsed = buf.readUInt32LE(32)
  const paletteSize = biBitCount <= 8 ? colorsUsed || 1 << biBitCount : 0
  const xorOffset = headerSize + paletteSize * 4
  const rowSize = Math.floor((w * biBitCount + 31) / 32) * 4
  const xorBytes = rowSize * h
  const andRowSize = Math.floor((w + 31) / 32) * 4
  const andOffset = xorOffset + xorBytes
  if (xorOffset + xorBytes > buf.length) return null

  const out = Buffer.alloc(w * h * 4)

  for (let y = 0; y < h; y++) {
    const srcRow = xorOffset + (h - 1 - y) * rowSize
    const andRow = andOffset + (h - 1 - y) * andRowSize
    for (let x = 0; x < w; x++) {
      let b = 0
      let g = 0
      let r = 0
      let a = 255

      if (bitCount === 32 || biBitCount === 32) {
        const p = srcRow + x * 4
        b = buf[p]
        g = buf[p + 1]
        r = buf[p + 2]
        a = buf[p + 3]
      } else if (biBitCount === 24) {
        const p = srcRow + x * 3
        b = buf[p]
        g = buf[p + 1]
        r = buf[p + 2]
      } else if (biBitCount === 8 || biBitCount === 4 || biBitCount === 1) {
        let idx: number
        if (biBitCount === 8) idx = buf[srcRow + x]
        else if (biBitCount === 4) {
          const byte = buf[srcRow + Math.floor(x / 2)]
          idx = x % 2 === 0 ? (byte >> 4) & 0xf : byte & 0xf
        } else {
          const byte = buf[srcRow + Math.floor(x / 8)]
          idx = (byte >> (7 - (x % 8))) & 1
        }
        const po = headerSize + idx * 4
        if (po + 3 >= buf.length) continue
        b = buf[po]
        g = buf[po + 1]
        r = buf[po + 2]
      } else {
        return null
      }

      // 32 位图靠自身 alpha；低位深用 AND 掩码抠透明
      if (biBitCount < 32) {
        if (andOffset + andRowSize * h > buf.length) continue
        const bit = (buf[andRow + Math.floor(x / 8)] >> (7 - (x % 8))) & 1
        if (bit) a = 0
      }

      const o = (y * w + x) * 4
      out[o] = b
      out[o + 1] = g
      out[o + 2] = r
      out[o + 3] = a
    }
  }
  return { width: w, height: h, buffer: out }
}

/** 单个资源帧（可能是 PNG，也可能是 DIB）转 nativeImage；尺寸以帧自身头部为准 */
function frameToImage(frame: Buffer, bitCount: number): NativeImage | null {
  if (frame.length >= 8 && frame.readUInt32BE(0) === PNG_MAGIC) {
    const img = nativeImage.createFromBuffer(frame)
    return img.isEmpty() ? null : img
  }
  const bmp = dibToBitmap(frame, bitCount)
  if (!bmp) return null
  const img = nativeImage.createFromBitmap(bmp.buffer, { width: bmp.width, height: bmp.height })
  return img.isEmpty() ? null : img
}

/** 从 DIB 头里读出真实宽高（RT_ICON 独立帧没有尺寸表） */
function dibSize(frame: Buffer): { width: number; height: number; bitCount: number } | null {
  if (frame.length < 40) return null
  const w = Math.abs(frame.readInt32LE(4))
  const h = Math.abs(frame.readInt32LE(8)) / 2
  const bits = frame.readUInt16LE(14)
  if (w <= 0 || h <= 0 || w > 1024 || h > 1024) return null
  return { width: w, height: h, bitCount: bits }
}

/* ------------------------------------------------------------------ 选帧 */

interface FrameSize {
  width: number
  height: number
}

/** 和资源管理器一致：优先精确尺寸，其次不超过目标的帧里最大的，最后才放大 */
function selectFrame<T extends FrameSize>(frames: T[], target: number): T | null {
  if (!frames.length) return null
  const sorted = [...frames].sort((a, b) => a.width - b.width)
  const exact = sorted.find((f) => f.width === target)
  if (exact) return exact
  const smaller = sorted.filter((f) => f.width <= target)
  if (smaller.length) return smaller[smaller.length - 1]
  return sorted[0]
}

/* ------------------------------------------------------------------ ICO */

interface IcoFrame extends FrameSize {
  bitCount: number
  bytes: number
  offset: number
}

function isIco(buf: Buffer): boolean {
  return buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1 && buf.readUInt16LE(4) > 0
}

function parseIcoFrames(buf: Buffer): IcoFrame[] {
  const count = buf.readUInt16LE(4)
  const frames: IcoFrame[] = []
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16
    if (e + 16 > buf.length) break
    frames.push({
      width: buf.readUInt8(e) || 256,
      height: buf.readUInt8(e + 1) || 256,
      bitCount: buf.readUInt16LE(e + 6) || 32,
      bytes: buf.readUInt32LE(e + 8),
      offset: buf.readUInt32LE(e + 12)
    })
  }
  return frames
}

function iconFromIco(buf: Buffer, target: number): NativeImage | null {
  const frames = parseIcoFrames(buf)
  const pick = selectFrame(frames, target)
  if (!pick) return null
  const frame = buf.subarray(pick.offset, pick.offset + pick.bytes)
  if (!frame.length) return null
  return frameToImage(frame, pick.bitCount)
}

/* ------------------------------------------------------------------ PE 图标 */

function iconFromPE(pe: PE, index: number, target: number): NativeImage | null {
  const groups = entriesOfType(pe, 14)
  const icons = entriesOfType(pe, 3)

  // 先把「被 GROUP_ICON 引用的帧」挑出来：剩下的孤儿帧各自成图标，
  // 而且 Windows 把它们排在组图标之前（Postman 就是这种：孤儿帧是新的橙色 logo）。
  const referenced = new Set<number>()
  for (const group of groups) {
    for (const frame of parseGroupFrames(pe, group)) referenced.add(frame.nId)
  }
  const orphans = icons.filter((i) => !referenced.has(i.nameId))

  const candidates: NativeImage[][] = []
  if (orphans.length) {
    const clusters = clusterIconFrames(pe, orphans)
    for (const cluster of clusters) {
      // 孤儿帧只有在「自己就是个完整图标」时才算数：至少要有 48 和 256 两档。
      // 零散残帧（Clawd on Desk 的 exe 里 id2/id3/id4 是别的图标的残留）会被
      // 误当成品牌图标顶掉真正的 logo，所以这里必须严格。
      const has48 = cluster.some((f) => f.width === 48)
      const hasBig = cluster.some((f) => f.width >= 256)
      const hasSmall = cluster.some((f) => f.width <= 16)
      if (has48 && hasBig && hasSmall) candidates.push(cluster.map((f) => f.image))
    }
  }
  if (groups.length) {
    const sortedGroups = [...groups].sort((a, b) => a.nameId - b.nameId)
    for (const group of sortedGroups) {
      const frames = parseGroupFrames(pe, group)
      const images: NativeImage[] = []
      for (const frame of frames) {
        const match = icons.find((i) => i.nameId === frame.nId)
        if (!match) continue
        const off = rvaToOffset(pe, match.dataRva)
        if (off <= 0) continue
        const img = frameToImage(pe.buf.subarray(off, off + match.size), frame.bitCount)
        if (img && !img.isEmpty()) images.push(img)
      }
      if (images.length) candidates.push(images)
    }
  }

  // 完全没有 GROUP_ICON 的 exe：所有帧按尺寸簇切分，单帧也算一个图标
  if (!candidates.length && icons.length) {
    for (const cluster of clusterIconFrames(pe, icons)) {
      candidates.push(cluster.map((f) => f.image))
    }
  }

  const chosen = candidates[Math.min(Math.max(index, 0), candidates.length - 1)]
  if (!chosen || !chosen.length) return null
  // 同一个图标的各尺寸帧里挑最合适的一档
  const frames: DecodedFrame[] = chosen.map((image, i) => {
    const s = image.getSize()
    return { nameId: i, width: s.width, height: s.height, image }
  })
  const pick = selectFrame(frames, target)
  return pick ? pick.image : null
}

/* ------------------------------------------------------------------ 无组帧聚类 */

interface DecodedFrame extends FrameSize {
  nameId: number
  image: NativeImage
}

/**
 * 把一堆「没有 GROUP_ICON 归类」的 RT_ICON 帧还原成若干图标。
 *
 * 一个图标的各尺寸帧连续排列，尺寸要么一路降（256→16）要么一路升（16→256），
 * 不同 exe 的排列方向不一样（Godot 升序、quark 降序），所以先由前两帧判定方向，
 * 之后只在「方向反转」时才认为进入了下一个图标。
 *
 * 不能简单用「尺寸重复」判定：百度网盘会把每个尺寸存两份
 * （256,256,128,128,64,64…），重复判定会把它切成一堆碎片。
 */
function clusterIconFrames(pe: PE, icons: ResourceEntry[]): DecodedFrame[][] {
  const sorted = [...icons].sort((a, b) => a.nameId - b.nameId)
  const clusters: DecodedFrame[][] = []
  let current: DecodedFrame[] = []
  let lastWidth = 0
  let direction: 1 | -1 | 0 = 0

  const flush = (): void => {
    if (current.length) clusters.push(current)
    current = []
    direction = 0
  }

  for (const entry of sorted) {
    const off = rvaToOffset(pe, entry.dataRva)
    if (off <= 0) continue
    const frame = pe.buf.subarray(off, off + entry.size)
    if (frame.length < 8) continue

    let decoded: DecodedFrame | null = null
    if (frame.readUInt32BE(0) === PNG_MAGIC) {
      const img = nativeImage.createFromBuffer(frame)
      if (!img.isEmpty()) {
        const s = img.getSize()
        decoded = { nameId: entry.nameId, width: s.width, height: s.height, image: img }
      }
    } else {
      const size = dibSize(frame)
      if (size) {
        const img = frameToImage(frame, size.bitCount)
        if (img && !img.isEmpty()) {
          decoded = { nameId: entry.nameId, width: size.width, height: size.height, image: img }
        }
      }
    }
    if (!decoded) continue

    if (lastWidth && decoded.width !== lastWidth) {
      const step: 1 | -1 = decoded.width > lastWidth ? 1 : -1
      if (direction === 0) {
        direction = step
      } else if (step !== direction) {
        // 方向反转：上一个图标到此结束
        flush()
        direction = step
      }
    }
    lastWidth = decoded.width
    current.push(decoded)
  }
  flush()

  // 单帧簇往往是同一个图标的额外大尺寸帧（quark.exe 里 768 与 256,256 就是这样），
  // 并进相邻簇才不会把索引整体错位。
  const merged: DecodedFrame[][] = []
  for (const cluster of clusters) {
    if (cluster.length === 1 && cluster[0].width >= 256 && merged.length) {
      merged[merged.length - 1].push(...cluster)
    } else {
      merged.push(cluster)
    }
  }
  return merged
}

/* ------------------------------------------------------------------ 对外 */

/**
 * 从任意文件按索引取图标。
 * 失败返回 null（调用方会退到矢量图，不要让卡片空着）。
 *
 * 索引取不到时退到第 0 个：快捷方式里写的索引（如 quark.exe,8）指向的图标，
 * 我们不一定能精确复现（一个 exe 里塞 30 多个图标时排布是编译器私有的）。
 * 这时宁可给「这个程序的主图标」——用户一眼还能认出是哪个软件——
 * 也不要给一张占位框，更不能空着。
 */
export function extractIcon(file: string, index = 0, target = 48): NativeImage | null {
  const head = readHead(file, 8)
  if (!head || head.length < 8) return null

  // .ico 通常只有几十 KB，整体读进来最省事；exe 只读资源节
  if (isIco(head)) {
    try {
      return iconFromIco(readFileSync(file), target)
    } catch {
      return null
    }
  }

  const pe = openResourceSection(file)
  if (!pe) return null

  // 有些程序（夸克网盘）会把几十个图标帧平铺在 exe 里、一个 GROUP_ICON 都不写，
  // 这种布局下「第 N 个图标」是编译器私有的，复现不出 Windows 的索引对应关系。
  // 与其猜错给出一个完全不相干的图（实测会落到图片占位框），不如用它的主图标：
  // 用户一眼仍能认出是哪个软件。
  if (index !== 0) {
    const groups = entriesOfType(pe, 14)
    const icons = entriesOfType(pe, 3)
    if (!groups.length && icons.length >= 20) return iconFromPE(pe, 0, target)
  }

  const wanted = iconFromPE(pe, index, target)
  if (wanted && !wanted.isEmpty()) return wanted
  if (index !== 0) return iconFromPE(pe, 0, target)
  return null
}
