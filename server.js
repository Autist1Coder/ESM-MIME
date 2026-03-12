import express from 'express'
import https from 'node:https'
import http from 'node:http'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as fs2 from 'node:fs'
// import { JSDOM } from "jsdom"
import { parse as parseHTML } from 'node-html-parser'

const
  isProduction = process.env.NODE_ENV === "production",
  normalizePath = pn => (pn = `${pn ?? ''}`) && (
    (pn.startsWith('./') ? './' : '')
    + path.normalize(pn)
  ),
  __dirname = normalizePath(import.meta.dirname + "/src"),
  host = process.env.HOST ?? '*.localhost',
  port = process.env.PORT ?? 8234,
  gscToken = process.env.GSC_TOKEN,
  ssh = await (async () => {
    try {
      // const dir = path.join(process.env.HOME ?? import.meta.resolve('../'))
      // return await (await import(path.join(dir, '.ssh/index.js'))).default()
      return await (await import("../.ssh/index.js")).default()
    } catch (e) {
      console.error(e)
    }
  })(),
  app = express(),
  server = (ssh ? https : http).createServer(...(
    ssh ? [ssh, app] : [app]
  )),
  urlRegex = /^([^?]*)(\?[^#]+)?(#.*)?$/s,
  getUrlParts = url => {
    url = `${url ?? ''}`
    const arr = url.match(urlRegex)
    arr[0] = normalizePath(arr[1])
    const srch = arr[2]
    arr[1] = srch && new URLSearchParams(srch)
    arr[2] = arr[3] ?? ''
    arr.length = 3; return arr
  },
  mergeUrlParts = (pn, srch, hash) => {
    pn = normalizePath(pn)
    srch = `${srch ?? ''}`, hash = `${hash ?? ''}`
    if (!/^\.{0,2}\//.test(pn)) pn = `/${pn}`
    if (srch && !srch.startsWith('?')) srch = `?${srch}`
    if (hash && !hash.startsWith('#')) hash = `#${srch}`
    return pn + srch + hash
  },
  resolvePath = (pn, ext) => {
    pn = normalizePath(pn)
    if (!ext) return pn
    let pn1 = pn + (pn.endsWith('.') ? '' : '.') + ext
    if (fstF.has(pn1)) return pn1
    let pn2 = pn + (pn.endsWith('/') ? '' : '/') + `index.${ext}`
    if (fstF.has(pn2)) return pn2
    return pn
  }
app.use((req, res, next) => {
  if (!/^(?:GET|HEAD|OPTIONS)$/i.test(req.method)) {
    res
      .set('Allow', 'GET, HEAD, OPTIONS')
      .status(405).end()
    return
  }
  res.set({
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Origin-Agent-Cluster': '?1'
  })
  next()
})

app.use(async (req, res, next) => {
  let status, content, contentType = "text/plain"
  try {
    const srcUrl = req.originalUrl
    let [pn, search, hash] = getUrlParts(srcUrl)
    switch (pn) {
      case "/index.html":
        res.redirect(301, "/")
        return
      case "/github.svg":
      case "/": break
      default:
        res.status(404).end()
        return
    }
    let accept = search?.get("accept")
    if (accept != null) contentType = accept, content = ""
    else {
      if (pn === "/") pn = "/index.html"
      const url = normalizePath(__dirname + pn)
      try {
        let stat;
        [content, stat] = await Promise.all([
          fs.readFile(url),
          fs.stat(url)
        ])
        let modfTime = stat.mtime
        res.set({
          "Last-Modified": modfTime = [
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            [modfTime.getUTCDay()] + ",",
            `${modfTime.getUTCDate()}`.padStart(2, 0),
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            [modfTime.getUTCMonth()],
            modfTime.getUTCFullYear(),
            [
              modfTime.getUTCHours(),
              modfTime.getUTCMinutes(),
              modfTime.getUTCSeconds()
            ].map(v => `${v}`.padStart(2, 0)).join(":"),
            "GMT"
          ].join(" ")
        })
        if (pn === "/index.html") {
          const root = parseHTML(content)
          const metaEl = parseHTML(
            "<meta name='google-site-verification' " +
            `content="${gscToken ?? ""}">`
          )
          root.querySelector("head").prepend(metaEl)
          content = root.outerHTML
        }
        switch (pn) {
          case "/index.html": contentType = "text/html"; break
          case "/github.svg": contentType = "image/svg+xml"
        }
      } catch (err) {
        status = 404
        throw err
      }
    }
  } catch (err) {
    console.error(err)
    content = err.stack
    status ??= 500
  }
  res.set({ 'Content-Type': contentType })
  res.status(status ?? 200).send(content ?? "")
})

if (!isProduction) server.listen(port, () => console.log(
  `Server is listening on: \x1b[32mhttps//${host}/${port}\x1b[0m`
))

export default isProduction ? app : undefined
