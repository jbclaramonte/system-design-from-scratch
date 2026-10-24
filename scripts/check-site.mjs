// Checks the website in site/ (docs/Website.md): `npm run site:check`.
//
//   node scripts/check-site.mjs [--external]
//
// Offline by default: every local link, image and anchor resolves, images carry dimensions and alt
// text, headings do not skip a level, the page loads nothing from another site (no script, no
// stylesheet, font or image URL), no version number is written in it, the install command and the Claude Code prompt are the
// README's, the attribution matches the corpus metadata, and every screenshot is under the size
// cap. `--external` also requests every external link of the page (only anchors point outside) and
// fails on a 404, a server error or no answer.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const site = join(root, 'site')
const MAX_IMAGE_BYTES = 250_000
const failures = []
const fail = (message) => failures.push(message)

const pages = readdirSync(site).filter((name) => name.endsWith('.html'))
if (pages.length === 0) fail('site/ has no HTML page')

/** Attribute values of every tag of a kind: [{ tag, attrs }]. */
function tagsOf(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map((match) => {
    const attrs = {}
    for (const attr of match[1].matchAll(
      /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    )) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? ''
    }
    return attrs
  })
}

const isExternal = (url) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
const externalLinks = new Set()

for (const page of pages) {
  const html = readFileSync(join(site, page), 'utf8')
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
  const where = (message) => `${page}: ${message}`

  // Local references resolve; external ones are only links.
  const refs = [
    ...tagsOf(html, 'a').map((attrs) => ({ tag: 'a', url: attrs.href })),
    ...tagsOf(html, 'img').map((attrs) => ({ tag: 'img', url: attrs.src })),
    ...tagsOf(html, 'link').map((attrs) => ({ tag: 'link', url: attrs.href, rel: attrs.rel })),
    ...tagsOf(html, 'source').map((attrs) => ({ tag: 'source', url: attrs.src ?? attrs.srcset }))
  ]
  for (const { tag, url, rel } of refs) {
    if (url === undefined) {
      if (tag !== 'source') fail(where(`<${tag}> without its URL`))
      continue
    }
    if (isExternal(url)) {
      if (tag === 'a') externalLinks.add(url)
      // The canonical URL is the page itself: it answers once the site is deployed.
      else if (tag === 'link' && rel === 'canonical') continue
      else fail(where(`<${tag}> loads ${url} from another site`))
      continue
    }
    const [path, anchor] = url.split('#')
    if (path === '') {
      if (anchor && !ids.has(anchor)) fail(where(`anchor #${anchor} has no target`))
      continue
    }
    const file = resolve(site, dirname(page), decodeURIComponent(path.split('?')[0]))
    if (!existsSync(file)) fail(where(`${url} does not exist`))
  }
  if (/<script\b/i.test(html)) fail(where('the page has a <script>: it must stay free of scripts'))
  if (/<(iframe|embed|object|video|audio)\b/i.test(html)) fail(where('embedded content'))

  // Images: dimensions (no layout shift) and alt text (empty only when decorative).
  for (const attrs of tagsOf(html, 'img')) {
    if (!attrs.width || !attrs.height) fail(where(`${attrs.src} has no width and height`))
    if (attrs.alt === undefined) fail(where(`${attrs.src} has no alt attribute`))
    else if (attrs.alt !== '' && attrs.alt.length < 20)
      fail(where(`${attrs.src}: alt is too short`))
  }

  // Headings: one h1, no skipped level.
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]))
  if (levels.filter((level) => level === 1).length !== 1) fail(where('needs exactly one <h1>'))
  levels.forEach((level, index) => {
    if (index > 0 && level > levels[index - 1] + 1) fail(where(`heading level jumps to h${level}`))
  })
  if (!/<html[^>]*\blang="/i.test(html)) fail(where('<html> has no lang'))
  if (!/<title>[^<]+<\/title>/i.test(html)) fail(where('no <title>'))

  // No version number: the download links point at releases/latest.
  const text = html.replace(/<[^>]+>/g, ' ')
  const version = /\bv?\d+\.\d+\.\d+\b/.exec(text.replace(/\b[0-9a-f]{40}\b/g, ''))
  if (version) fail(where(`writes a version number (${version[0]}): link releases/latest instead`))
  if (!html.includes('/releases/latest'))
    fail(where('the download section must link releases/latest'))

  // The install command is the README's.
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const command = /curl -fsSL \S+install\.sh \| bash/.exec(readme)?.[0]
  if (!command) fail('README.md has no install command')
  else if (!html.includes(command)) fail(where('the install command differs from the README'))

  // The Claude Code prompt: a plain, selectable block that names install.sh by its raw URL and says
  // the same as the README's (docs/Website.md: keep both in sync with install.sh).
  const rawUrl =
    'https://raw.githubusercontent.com/jbclaramonte/system-design-from-scratch/main/install.sh'
  const decode = (text) =>
    text
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&amp;', '&')
  const squash = (text) => text.replace(/\s+/g, ' ').trim()
  const sitePrompt = /<code id="claude-prompt">([\s\S]*?)<\/code>/.exec(html)?.[1]
  const readmePrompt = /### Install with Claude Code[\s\S]*?```text\n([\s\S]*?)\n```/.exec(
    readme
  )?.[1]
  if (!sitePrompt) fail(where('no Claude Code prompt (<code id="claude-prompt">)'))
  else if (!decode(sitePrompt).includes(rawUrl))
    fail(where('the Claude Code prompt does not contain the install.sh raw URL'))
  else if (!readmePrompt) fail('README.md has no "Install with Claude Code" prompt')
  else if (squash(decode(sitePrompt)) !== squash(readmePrompt))
    fail(where('the Claude Code prompt differs from the README'))

  // Attribution: the pinned primer commit and its license, as in the corpus metadata.
  const { metadata } = JSON.parse(
    readFileSync(join(root, 'resources', 'corpus', 'primer.json'), 'utf8')
  )
  for (const needed of [
    metadata.commitSha,
    metadata.license.url,
    metadata.repositoryUrl,
    metadata.modifications,
    'Copyright 2017 Donne Martin',
    'not endorsed by the'
  ]) {
    const flat = (value) => value.replace(/\s+/g, ' ')
    if (!flat(text).includes(flat(needed)) && !html.includes(needed)) {
      fail(where(`attribution is out of date: ${needed.slice(0, 60)}...`))
    }
  }
}

// CSS: no remote URL or import.
function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return cssFiles(path)
    return name.endsWith('.css') ? [path] : []
  })
}
for (const file of cssFiles(site)) {
  const css = readFileSync(file, 'utf8')
  if (/@import|url\(\s*['"]?(https?:)?\/\//i.test(css))
    fail(`${file}: loads something from another site`)
  for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
    if (!match[1].startsWith('data:') && !existsSync(resolve(dirname(file), match[1]))) {
      fail(`${file}: ${match[1]} does not exist`)
    }
  }
}

// Colors follow the app: the base (light) block of the page's custom properties repeats the Light
// "Warm" tokens of the app, and the dark media block the Dark ones (docs/Design System.md).
const tokensCss = readFileSync(
  join(root, 'src', 'renderer', 'src', 'styles', 'design-tokens.css'),
  'utf8'
)
const declarations = (css) =>
  new Map([...css.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))
const appThemes = {
  dark: declarations(/\[data-theme='dark'\]\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? ''),
  light: declarations(/\[data-theme='light'\]\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? '')
}
const styleCss = readFileSync(join(site, 'assets', 'style.css'), 'utf8')
const siteBase = declarations(/\n:root \{([^}]*)\}/.exec(styleCss)?.[1] ?? '')
const siteDark = declarations(
  /prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/.exec(styleCss)?.[1] ?? ''
)
const colorMap = {
  '--canvas': '--color-canvas',
  '--surface': '--color-surface-base',
  '--surface-strong': '--color-surface-elevated',
  '--text': '--color-text-primary',
  '--text-secondary': '--color-text-secondary',
  '--link': '--color-link',
  '--accent': '--color-action',
  '--on-accent': '--color-on-primary',
  '--focus': '--color-border-focus'
}
for (const [theme, site] of [
  ['light', siteBase],
  ['dark', siteDark]
]) {
  for (const [name, token] of Object.entries(colorMap)) {
    const expected = appThemes[theme].get(token)
    // The page's dark link and accent are lighter tints chosen for the page; only the base theme
    // and the surfaces are held to the app's values.
    if (theme === 'dark' && ['--link', '--focus', '--text-secondary'].includes(name)) continue
    if (site.get(name) !== expected) {
      fail(`style.css: ${theme} ${name} is ${site.get(name)}, the app's ${token} is ${expected}`)
    }
  }
}

// Fonts: each self-hosted font comes with its license, linked from the page's attribution.
const fontsDir = join(site, 'assets', 'fonts')
if (existsSync(fontsDir)) {
  const pageHtml = pages.map((page) => readFileSync(join(site, page), 'utf8')).join('\n')
  for (const name of readdirSync(fontsDir).filter((file) => file.endsWith('.woff2'))) {
    const family = name.replace(/-latin-wght-normal\.woff2$/, '')
    const license = `assets/fonts/LICENSE-${family}.txt`
    if (!existsSync(join(site, license))) fail(`${name} has no ${license}`)
    else if (!pageHtml.includes(license)) fail(`the page does not link ${license}`)
    if (!styleCss.includes(`fonts/${name}`)) fail(`style.css does not use fonts/${name}`)
  }
  if (!existsSync(join(fontsDir, 'plus-jakarta-sans-latin-wght-normal.woff2')))
    fail('the Light theme font Plus Jakarta Sans is not in assets/fonts')
}

// Screenshots are small and every one is used.
const imgDir = join(site, 'assets', 'img')
if (existsSync(imgDir)) {
  const used = pages.map((page) => readFileSync(join(site, page), 'utf8')).join('\n')
  for (const name of readdirSync(imgDir)) {
    const size = statSync(join(imgDir, name)).size
    if (size > MAX_IMAGE_BYTES) fail(`assets/img/${name} is ${size} bytes, over ${MAX_IMAGE_BYTES}`)
    if (!used.includes(`assets/img/${name}`)) fail(`assets/img/${name} is not used by any page`)
  }
}

if (process.argv.includes('--external')) {
  const timeout = (ms) =>
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  for (const url of externalLinks) {
    try {
      let reply = await Promise.race([
        fetch(url, { method: 'HEAD', redirect: 'follow' }),
        timeout(20_000)
      ])
      // Some servers refuse HEAD.
      if (reply.status === 405 || reply.status === 403) {
        reply = await Promise.race([fetch(url, { redirect: 'follow' }), timeout(20_000)])
      }
      if (reply.status >= 400) fail(`${url} answers ${reply.status}`)
      else console.log(`${reply.status} ${url}`)
    } catch (error) {
      fail(`${url}: ${error.message}`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((message) => `FAIL ${message}`).join('\n'))
  process.exit(1)
}
console.log(
  `site-check: ${pages.length} page(s) ok, ${externalLinks.size} external link(s)${process.argv.includes('--external') ? ' answered' : ' (not requested, use --external)'}`
)
