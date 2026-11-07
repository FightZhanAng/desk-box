/**
 * 图标生成器 —— 纯 Node，零依赖，不碰 sharp / canvas 这类原生模块。
 *
 * 产出：
 *   resources/icon.png          256×256 应用图标
 *   resources/icon.ico          多尺寸 Windows 图标（16/24/32/48/64/128/256）
 *   resources/icon.icns         macOS 图标
 *   resources/tray/tray.png     32×32 托盘图标（macOS / 兜底）
 *   resources/tray/tray.ico     多尺寸 Windows 托盘图标（16/20/24/32/40/48/64）
 *
 * 为什么自己写 PNG / ICO / ICNS：
 * electron-builder 默认用它的 WASM 图标工具做 png→ico/icns 转换，
 * 那东西在内存受限的环境里会 `WebAssembly.Memory(): could not allocate memory`
 * 直接把打包流程搞挂。自己生成既绕开这个坑，也少一层依赖。
 *
 * 造型：一只抽屉。盒体木色渐变，中间一道缝，缝下一个把手。
 * 小尺寸下缝和把手会按「最小像素」加粗，否则 16px 缩略图会糊成一块木牌。
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* -------------------------------------------------------------- PNG 编码 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function toPNG(canvas) {
  const { size, px } = canvas
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)

  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0 // filter: None
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4
      const dst = y * stride + 1 + x * 4
      raw[dst] = Math.round(clamp(px[src], 0, 255))
      raw[dst + 1] = Math.round(clamp(px[src + 1], 0, 255))
      raw[dst + 2] = Math.round(clamp(px[src + 2], 0, 255))
      raw[dst + 3] = Math.round(clamp(px[src + 3], 0, 255))
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* -------------------------------------------------------------- 画布 */

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

function createCanvas(size) {
  return { size, px: new Float32Array(size * size * 4) }
}

function blendPixel(canvas, x, y, color, alpha) {
  if (alpha <= 0) return
  const a = Math.min(1, alpha)
  const index = (y * canvas.size + x) * 4
  const dstAlpha = canvas.px[index + 3] / 255
  const outAlpha = a + dstAlpha * (1 - a)
  if (outAlpha <= 0.0001) return

  canvas.px[index] = (color[0] * a + canvas.px[index] * dstAlpha * (1 - a)) / outAlpha
  canvas.px[index + 1] = (color[1] * a + canvas.px[index + 1] * dstAlpha * (1 - a)) / outAlpha
  canvas.px[index + 2] = (color[2] * a + canvas.px[index + 2] * dstAlpha * (1 - a)) / outAlpha
  canvas.px[index + 3] = outAlpha * 255
}

/** 圆角矩形的有符号距离场，< 0 在内部 */
function roundRectSDF(px_, py_, x0, y0, x1, y1, radius) {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const hx = (x1 - x0) / 2 - radius
  const hy = (y1 - y0) / 2 - radius
  const dx = Math.abs(px_ - cx) - hx
  const dy = Math.abs(py_ - cy) - hy
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - radius
}

const SUPERSAMPLE = 4

function fillRoundRect(canvas, x0, y0, x1, y1, radius, colorAt) {
  const startX = Math.max(0, Math.floor(x0) - 1)
  const endX = Math.min(canvas.size - 1, Math.ceil(x1) + 1)
  const startY = Math.max(0, Math.floor(y0) - 1)
  const endY = Math.min(canvas.size - 1, Math.ceil(y1) + 1)
  const radiusClamped = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2)

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      let hit = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const fx = x + (sx + 0.5) / SUPERSAMPLE
          const fy = y + (sy + 0.5) / SUPERSAMPLE
          if (roundRectSDF(fx, fy, x0, y0, x1, y1, radiusClamped) <= 0) hit += 1
        }
      }
      if (hit === 0) continue

      const coverage = hit / (SUPERSAMPLE * SUPERSAMPLE)
      const color = colorAt(y + 0.5)
      const alpha = coverage * (color.length > 3 ? color[3] : 1)
      blendPixel(canvas, x, y, color, alpha)
    }
  }
}

function lerpColor(from, to, t) {
  const k = clamp(t, 0, 1)
  return [
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k
  ]
}

/* -------------------------------------------------------------- 图形 */

/** 应用图标：木色抽屉，全幅不留底板（16px 下的快捷方式还有系统角标要叠） */
function drawAppIcon(size) {
  const canvas = createCanvas(size)
  const u = (value) => (value * size) / 256

  /**
   * 细线的尺寸换算。
   * 直接按比例缩，16px 下把手只剩 0.8px，糊成一条灰影；
   * 简单抬一个最小像素又会让 256px 版本突然变粗。
   * 用 0.68 次幂插值：大尺寸完全按设计稿，小尺寸平滑加粗，中间没有台阶。
   */
  const stroke = (designPx) => designPx * Math.pow(size / 256, 0.68)

  // 外框：深木色，相当于抽屉的盒体
  fillRoundRect(canvas, u(20), u(32), u(236), u(224), u(30), (y) => {
    const t = (y - u(32)) / (u(224) - u(32))
    return lerpColor([154, 107, 68], [102, 66, 39], t)
  })

  // 顶部盒沿的一道柔光，让上边缘有厚度而不是一块死色。
  // 小尺寸下这条带只有两三像素，反而会糊成脏边，直接不画。
  if (size >= 48) {
    fillRoundRect(canvas, u(27), u(38), u(229), u(56), u(18), () => [255, 250, 242, 0.16])
  }

  // 抽屉面板：浅木色，与外框拉开明度差
  fillRoundRect(canvas, u(36), u(74), u(220), u(210), u(22), (y) => {
    const t = (y - u(74)) / (u(210) - u(74))
    return lerpColor([218, 173, 126], [186, 138, 92], t)
  })

  // 把手：深色横条，压住面板中心
  const handleH = stroke(13)
  const handleW = stroke(54)
  const handleY = u(126)
  fillRoundRect(
    canvas,
    size / 2 - handleW / 2,
    handleY,
    size / 2 + handleW / 2,
    handleY + handleH,
    handleH / 2,
    () => [92, 58, 34]
  )

  return canvas
}

/**
 * 托盘图标：木色抽屉的扁平版。
 *
 * 托盘在每个 DPI 档要用不同的像素尺寸出图（100% → 16px，125% → 20px，150% → 24px），
 * 所以这套几何画在 16×16 的网格上再按 size/16 吸附到整数像素：边全部落在像素
 * 边界上，16px 下不会被抗锯齿抹成一片灰。描边宽度单独取整，免得内框被吸附成
 * 一边 2px 一边 1px。
 *
 * 为什么不用单色：16px 里只剩十来个像素可用，「深色方块 + 白色横条」缩下去
 * 更像一张卡片或一段文字，认不出是抽屉；木色边框和内芯的明度差在小尺寸下
 * 反而更稳，也和应用图标是同一个记号。
 */
function drawTrayIcon(size) {
  const canvas = createCanvas(size)
  const k = size / 16
  const snap = (value) => Math.round(value * k)

  // 外边距和描边共用同一个整数单位：分别按 snap() 取会一边 3px 一边 2px，
  // 24 / 40 这些非整数倍档位会明显偏到右下角
  const unit = Math.max(1, Math.round(k))
  const x0 = unit
  const y0 = unit
  const x1 = size - unit
  const y1 = size - unit
  const rim = unit

  // 盒体：深木色描边
  fillRoundRect(canvas, x0, y0, x1, y1, snap(2.5), () => [92, 60, 35])
  // 抽屉面板：浅木色，圆角跟外框同圆心，看起来才像一层壳
  fillRoundRect(canvas, x0 + rim, y0 + rim, x1 - rim, y1 - rim, Math.max(1, snap(2.5) - rim), () => [
    198, 150, 104
  ])
  // 把手：略低于面板中线，读起来才像抽屉拉手而不是开关
  fillRoundRect(
    canvas,
    snap(5.5),
    snap(8.2),
    snap(10.5),
    snap(10.2),
    snap(0.7),
    () => [74, 47, 26]
  )

  return canvas
}

/* -------------------------------------------------------------- ICO / ICNS */

function buildICO(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16

  for (const image of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0)
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(image.png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += image.png.length
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

function buildICNS(entries) {
  const parts = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 4, 'ascii')
    head.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([head, png])
  })

  const body = Buffer.concat(parts)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 4, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

/* -------------------------------------------------------------- 产出 */

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_CACHE = new Map()

function renderPNG(size) {
  if (!PNG_CACHE.has(size)) PNG_CACHE.set(size, toPNG(drawAppIcon(size)))
  return PNG_CACHE.get(size)
}

mkdirSync(join(ROOT, 'resources', 'tray'), { recursive: true })

writeFileSync(join(ROOT, 'resources', 'icon.png'), renderPNG(256))
writeFileSync(
  join(ROOT, 'resources', 'icon.ico'),
  buildICO(ICO_SIZES.map((size) => ({ size, png: renderPNG(size) })))
)
writeFileSync(
  join(ROOT, 'resources', 'icon.icns'),
  buildICNS([
    { type: 'ic11', png: renderPNG(32) },
    { type: 'ic12', png: renderPNG(64) },
    { type: 'ic07', png: renderPNG(128) },
    { type: 'ic08', png: renderPNG(256) },
    { type: 'ic13', png: renderPNG(256) },
    { type: 'ic09', png: renderPNG(512) },
    { type: 'ic14', png: renderPNG(512) },
    { type: 'ic10', png: renderPNG(1024) }
  ])
)
writeFileSync(join(ROOT, 'resources', 'tray', 'tray.png'), toPNG(drawTrayIcon(32)))

/**
 * Windows 托盘另给一份多尺寸 .ico。
 * Electron 拿到 .ico 会交给系统 LoadImage(IMAGE_ICON, SM_CXSMICON)，由 Windows
 * 按当前 DPI 挑最接近的那一档，1:1 出图；喂 png 则只是「位图转 HICON」，
 * 16px 的图在 125% 缩放下被任务栏硬拉到 20px —— 那才是图标发糊的来源。
 * 档位覆盖 100/125/150/200/250/300/400%，外加取整误差里最常被挑中的 20。
 */
const TRAY_ICO_SIZES = [16, 20, 24, 32, 40, 48, 64]
writeFileSync(
  join(ROOT, 'resources', 'tray', 'tray.ico'),
  buildICO(TRAY_ICO_SIZES.map((size) => ({ size, png: toPNG(drawTrayIcon(size)) })))
)

// 调试用：ICON_PREVIEW=1 时把 16/24/32/48 的原尺寸结果最近邻放大，方便肉眼查小图可读性
if (process.env.ICON_PREVIEW) {
  const pixelate = (source, factor) => {
    const out = createCanvas(source.size * factor)
    for (let y = 0; y < out.size; y += 1) {
      for (let x = 0; x < out.size; x += 1) {
        const sx = Math.floor(x / factor)
        const sy = Math.floor(y / factor)
        const si = (sy * source.size + sx) * 4
        const di = (y * out.size + x) * 4
        for (let k = 0; k < 4; k += 1) out.px[di + k] = source.px[si + k]
      }
    }
    return out
  }
  for (const size of [16, 24, 32, 48]) {
    writeFileSync(
      join(ROOT, 'resources', `.preview-${size}.png`),
      toPNG(pixelate(drawAppIcon(size), Math.round(256 / size)))
    )
  }

  // 托盘要按各 DPI 档的真实像素尺寸预览，并且铺在浅色 / 深色任务栏底色上看：
  // 白描边在浅色背景上是隐形的，只看透明底会误判。
  const onBackground = (icon, factor, bg) => {
    const out = createCanvas(icon.size * factor)
    for (let y = 0; y < out.size; y += 1) {
      for (let x = 0; x < out.size; x += 1) {
        blendPixel(out, x, y, bg, 1)
        const si = (Math.floor(y / factor) * icon.size + Math.floor(x / factor)) * 4
        const alpha = icon.px[si + 3] / 255
        if (alpha > 0) blendPixel(out, x, y, [icon.px[si], icon.px[si + 1], icon.px[si + 2]], alpha)
      }
    }
    return out
  }
  const BAR_BACKGROUNDS = { light: [243, 243, 243], dark: [32, 32, 32] }
  for (const size of [16, 20, 24, 32]) {
    for (const [tone, bg] of Object.entries(BAR_BACKGROUNDS)) {
      writeFileSync(
        join(ROOT, 'resources', `.preview-tray-${size}-${tone}.png`),
        toPNG(onBackground(drawTrayIcon(size), Math.round(320 / size), bg))
      )
    }
  }
}

console.log('[icons] 已生成 resources/icon.png · icon.ico · icon.icns · tray/tray.png')
