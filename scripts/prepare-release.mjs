import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

export function parseHoogle(input) {
  let moduleName = ""
  let inClass = false
  const names = new Set()
  for (const line of input.split(/\r?\n/)) {
    const moduleMatch = line.match(/^module\s+([A-Za-z0-9_.']+)/)
    if (moduleMatch) {
      moduleName = moduleMatch[1]
      inClass = false
      continue
    }
    if (inClass) {
      if (line.trim() === "}") inClass = false
      continue
    }
    const declaration = line.match(/^(?:\[)?([A-Za-z_][A-Za-z0-9_']*|\([^)]*\))\s+::/)
    const instance = line.match(/^instance\s+(.+)/)
    const classDeclaration = line.match(/^class\s+(.+?)\s+where\s*\{/)
    if (classDeclaration) {
      const name = classDeclaration[1].match(/(?:^|\s)([A-Z][A-Za-z0-9_']*)/)
      if (name) names.add(`${moduleName}.${name[1]}`)
      inClass = true
    } else if (instance) {
      names.add(`${moduleName}.${instance[1].replace(/\s+where.*$/, "").trim()}`)
    } else if (declaration && !line.startsWith("[")) {
      names.add(`${moduleName}.${declaration[1].replace(/^\((.*)\)$/, "$1")}`)
    } else {
      const typeDeclaration = line.match(
        /^(?:data|newtype|type|pattern)\s+(?:family\s+)?([A-Z][A-Za-z0-9_']*)/,
      )
      if (typeDeclaration) names.add(`${moduleName}.${typeDeclaration[1]}`)
    }
  }
  return [...names].sort()
}

export function addSince(source, name, version) {
  const declaration = name.includes(" ")
    ? new RegExp(`^instance\\s+${escapeRegExp(name)}(?:\\s|$)`, "m")
    : new RegExp(`^${escapeRegExp(name)}\\b`, "m")
  if (new RegExp(`@since\\s+`).test(source)) {
    const match = declaration.exec(source)
    if (match) {
      const before = source.slice(0, match.index)
      const block = before.match(/(?:^--.*\n)+$/)
      if (block?.[0].includes("@since")) return source
    }
  }
  const match = declaration.exec(source)
  if (!match) throw new Error(`Cannot locate public declaration: ${name}`)
  const before = source.slice(0, match.index)
  const block = before.match(/(?:^--.*\n)+$/)
  if (block) {
    return source.slice(0, match.index) + `-- @since ${version}\n` + source.slice(match.index)
  }

  return source.slice(0, match.index) + `-- | @since ${version}\n` + source.slice(match.index)
}

export function isLocalDeclaration(source, name) {
  if (name.includes(" "))
    return new RegExp(`^instance\\s+${escapeRegExp(name)}(?:\\s|$)`, "m").test(source)
  return new RegExp(
    `^(?:data|newtype|type|class|pattern)\\b[^\\n]*\\b${escapeRegExp(name)}\\b|^${escapeRegExp(name)}\\b`,
    "m",
  ).test(source)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function updateVersion(path, version) {
  const source = readFileSync(path, "utf8")
  writeFileSync(path, source.replace(/^version:\s+.*$/m, `version: ${version}`))
}

function findHoogleFile(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name.endsWith(".txt") && path.includes("doc/html")) files.push(path)
    }
  }
  visit(root)
  if (!files.length) throw new Error("stack haddock did not produce a Hoogle file")
  return files.sort((a, b) => b.length - a.length)[0]
}

function main() {
  const version = process.argv[2]
  if (!version) throw new Error("usage: prepare-release.mjs VERSION")
  const root = resolve(new URL("..", import.meta.url).pathname)
  updateVersion(join(root, "package.yaml"), version)
  execFileSync("stack", ["haddock", "--no-haddock-deps"], { cwd: root, stdio: "inherit" })
  const keys = parseHoogle(readFileSync(findHoogleFile(join(root, ".stack-work")), "utf8"))
  const baselinePath = join(root, "api", "effectful-monad-logger.api")
  const baseline = existsSync(baselinePath)
    ? new Set(readFileSync(baselinePath, "utf8").split(/\r?\n/).filter(Boolean))
    : new Set()
  for (const key of keys.filter((key) => !baseline.has(key))) {
    const [, name] = key.match(/\.([^.]*)$/) ?? []
    if (!name) continue
    const file = join(root, "src", `${key.slice(0, key.lastIndexOf(".")).replaceAll(".", "/")}.hs`)
    if (!existsSync(file)) throw new Error(`Cannot locate module source for ${key}`)
    const source = readFileSync(file, "utf8")
    if (isLocalDeclaration(source, name)) writeFileSync(file, addSince(source, name, version))
  }
  writeFileSync(baselinePath, `${keys.join("\n")}\n`)
  execFileSync("stack", ["build"], { cwd: root, stdio: "inherit" })
}

if (process.argv[1] === new URL(import.meta.url).pathname) main()
