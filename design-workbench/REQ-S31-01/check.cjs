const fs = require('fs')
const path = require('path')
// 相对脚本自身定位，换机器、换目录都能跑
const dir = __dirname + path.sep
const html = fs.readFileSync(dir + 'index.html', 'utf8')
const js = fs.readFileSync(dir + 'app.js', 'utf8')

/* 1. every var(--token) must be defined somewhere */
const defined = new Set()
for (const m of (html + js).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1])
const used = new Set()
for (const m of (html + js).matchAll(/var\((--[a-z0-9-]+)/g)) used.add(m[1])
const undef = [...used].filter((t) => !defined.has(t))
console.log('undefined tokens:', undef.length ? undef.join(', ') : 'none')

/* 2. tokens defined but never used (dead weight, not an error) */
const unused = [...defined].filter(
  (t) => !used.has(t) && !t.startsWith('--section-y') && t !== '--text-4xl' && t !== '--container-max'
)
console.log('defined-but-unused:', unused.join(', ') || 'none')

/* 3. every id referenced from JS exists in HTML */
const ids = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1])
const missingIds = ids.filter((id) => !html.includes(`id="${id}"`))
console.log('missing ids:', missingIds.length ? missingIds.join(', ') : 'none')

/* 4. data-act values emitted by render() vs handled in the click handler */
const emitted = new Set()
for (const m of js.matchAll(/data-act="([a-z-]+)"/g)) emitted.add(m[1])
const handled = new Set()
for (const m of js.matchAll(/a === '([a-z-]+)'/g)) handled.add(m[1])
const unhandled = [...emitted].filter((a) => !handled.has(a))
console.log('emitted acts:', emitted.size, '| unhandled:', unhandled.length ? unhandled.join(', ') : 'none')

/* 5. classes used in JS markup must have a CSS rule */
const css = html.slice(html.indexOf('<style>', html.indexOf('</style>') + 8))
const jsClasses = new Set()
for (const m of js.matchAll(/class="([^"]*)"/g))
  m[1].split(/\s+/).forEach((c) => c && !c.includes('+') && !c.includes("'") && jsClasses.add(c))
for (const m of js.matchAll(/'(\s?)(is-[a-z]+|glyph--[a-z]+)'/g)) jsClasses.add(m[2])
const noRule = [...jsClasses].filter((c) => !css.includes('.' + c))
console.log('classes without CSS rule:', noRule.length ? noRule.join(', ') : 'none')

/* 6. balanced tags for the structural elements */
for (const tag of ['section', 'div', 'header', 'footer', 'nav', 'article', 'button', 'svg', 'style', 'script']) {
  const open = (html.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length
  const close = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length
  if (open !== close) console.log(`tag mismatch <${tag}>: ${open} open / ${close} close`)
}
console.log('tag balance: checked')

/* 7. inline styles in HTML markup must use var() only */
const inlineBad = []
for (const m of html.matchAll(/style="([^"]*)"/g)) {
  const v = m[1]
  if (/#[0-9a-fA-F]{3,8}|\b\d+px\b/.test(v)) inlineBad.push(v)
}
console.log('bad inline styles:', inlineBad.length ? inlineBad.join(' | ') : 'none')

/* 8. gradients / shadows only from tokens */
const grads = [...html.matchAll(/(linear|radial)-gradient\([^;]*/g)].map((m) => m[0])
const gradBad = grads.filter((g) => !/var\(--/.test(g))
console.log('gradients:', grads.length, '| without tokens:', gradBad.length ? gradBad.join(' | ') : 'none')
