import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * 便携版：把所有 JS / CSS 内联进一个 index.html，并且用**非 ES module** 的 classic script。
 *
 * 为什么要 classic script：`file://` 下浏览器会因为 CORS 拒绝执行 `<script type="module">`，
 * 双击打开就是白屏。classic script 没这个限制，所以负责人可以：
 *
 *   解压 → 双击 index.html → 选视频文件夹 → 玩
 *
 * 完全不需要装 node、不需要起服务器、不需要联网。
 */

const OUT_DIR = 'dist-portable'

/** 构建产物落盘之后再动手：vite 的 html 插件会把 generateBundle 阶段的改动覆盖掉。 */
function inlineEverything(): Plugin {
  return {
    name: 'nova-inline-everything',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const dir = options.dir ?? OUT_DIR
      const htmlPath = join(dir, 'index.html')
      let html = readFileSync(htmlPath, 'utf8')

      const inlined: string[] = []
      const scripts: string[] = []

      const inlineTag = (pattern: RegExp, wrap: (content: string) => string) => {
        // 先收集，再逐个替换：注入的代码里可能带 `$&`、`$'`，
        // 用函数式 replace 才能避免被当成替换模式。
        for (const match of html.matchAll(pattern)) {
          const content = readFileSync(join(dir, match[1]), 'utf8')
          const tag = match[0]
          html = html.replace(tag, () => wrap(content))
          inlined.push(tag)
          rmSync(join(dir, match[1]), { force: true })
        }
      }

      // CSS 可以留在 head（内联 <style> 本来就放那儿）
      inlineTag(/<link[^>]*href="\.?\/([^"]+\.css)"[^>]*>/g, (css) => `<style>\n${css}\n</style>`)
      // classic script 是同步执行的：留在 head 里会在 <body> 解析出来之前就跑，找不到 #root。
      // 先摘出来，最后统一插到 </body> 前面。
      inlineTag(/<script[^>]*src="\.?\/([^"]+\.js)"[^>]*><\/script>/g, (code) => {
        scripts.push(code)
        return ''
      })

      // 每个外链标签都必须真的被替换掉了
      for (const tag of inlined) {
        if (html.includes(tag)) throw new Error(`没能内联这个标签，file:// 下会白屏：${tag}`)
      }
      if (/<script[^>]*\ssrc=/.test(html) || /<link[^>]*\shref="[^"]*\.css"/.test(html)) {
        throw new Error('还有外链资源没被内联，file:// 下会白屏')
      }

      const bundle = scripts.map((code) => `<script>\n${code}\n</script>`).join('\n')
      if (bundle) {
        if (!html.includes('</body>')) throw new Error('index.html 里没有 </body>，没法把脚本放到位')
        html = html.replace('</body>', () => `${bundle}\n  </body>`)
      }

      writeFileSync(htmlPath, html)
      rmSync(join(dir, 'static'), { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  base: './',
  // 便携版不带 public/：视频由负责人自己选文件夹，几百 MB 的素材不该塞进压缩包
  publicDir: false,
  define: { __PORTABLE__: 'true' },
  plugins: [react(), inlineEverything()],
  build: {
    outDir: OUT_DIR,
    // 单文件：不切 chunk，才能内联成一个 html
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    target: 'es2020',
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
