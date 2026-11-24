import type { Analyte, Identifier, Packet } from './types'

/**
 * Deterministic, on-device identifier rules. These run before any model sees the
 * text and again on the outbound packet, so the privacy boundary never depends
 * on a model behaving well.
 */
const RULES: { kind: string; re: RegExp; group?: number }[] = [
  { kind: 'Email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  {
    kind: 'Phone',
    // Shaped so that value ranges such as 4000-10000 are never mistaken for a phone number.
    re: /(?:(?:ph(?:one)?|tel|mob(?:ile)?|contact|whatsapp)\.?\s*(?:no\.?)?\s*[:\-]?\s*\+?[\d()][\d() -]{6,16}\d|\+\d{1,3}[ -]?\d[\d -]{7,13}\d|\(\d{3,5}\)[ -]?\d{3,4}[ -]?\d{4}|\b[6-9]\d{4}[ -]?\d{5}\b|\b0\d{2,4}[ -]\d{3,4}[ -]\d{4}\b)/gi,
  },
  { kind: 'Aadhaar', re: /\b\d{4}\s\d{4}\s\d{4}\b/g },
  {
    kind: 'Name',
    re: /(?:patient(?:'s)?\s*name|name\s*of\s*patient|name|patient)\s*[:\-]\s*((?:(?:mr|mrs|ms|miss|master|dr|shri|smt)\.?\s+)?[\p{L}\p{M}.'-]+(?:[ \t]{1,2}[\p{L}\p{M}.'-]+){0,3})/giu,
    group: 1,
  },
  {
    kind: 'Doctor',
    re: /(?:ref(?:erred|\.)?\s*(?:by|doctor|dr)?|consultant|physician|doctor)\s*[:\-]\s*((?:dr\.?\s+)?[\p{L}\p{M}.'-]+(?:[ \t]{1,2}[\p{L}\p{M}.'-]+){0,3})/giu,
    group: 1,
  },
  {
    kind: 'Record ID',
    re: /(?:patient\s*id|uhid|mrn|lab\s*(?:no|id)|sample\s*(?:no|id)|barcode|reg(?:istration)?\.?\s*(?:no|id)|visit\s*(?:no|id)|accession\s*(?:no|id)?|bill\s*(?:no|id))\.?\s*[:#\-]\s*([A-Z0-9][A-Z0-9\/-]{3,})/gi,
    group: 1,
  },
  {
    kind: 'Date',
    re: /\b(?:\d{1,2}([\/.-])\d{1,2}\1\d{2,4}|\b(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|[12]\d|3[01])[\/.-](?:19|20)\d{2}\b|\d{1,2}[\s-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s-,]+\d{2,4})(?:[ ,]+\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)?/gi,
  },
  {
    kind: 'Address',
    re: /(?:address|addr)\s*[:\-]\s*([^\n]{6,90})/gi,
    group: 1,
  },
]

export interface Span {
  start: number
  end: number
  kind: string
  by: 'rules' | 'model'
}

export function findSpans(text: string, modelFound: string[] = []): Span[] {
  const spans: Span[] = []
  for (const rule of RULES) {
    rule.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.re.exec(text))) {
      const hit = rule.group ? m[rule.group] : m[0]
      if (!hit || hit.trim().length < 3) continue
      const start = m.index + m[0].lastIndexOf(hit)
      spans.push({ start, end: start + hit.length, kind: rule.kind, by: 'rules' })
    }
  }
  for (const raw of modelFound) {
    const needle = raw.trim()
    if (needle.length < 3) continue
    let from = 0
    const lower = text.toLowerCase()
    for (;;) {
      const i = lower.indexOf(needle.toLowerCase(), from)
      if (i < 0) break
      spans.push({ start: i, end: i + needle.length, kind: 'Flagged by model', by: 'model' })
      from = i + needle.length
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: Span[] = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end)
      continue
    }
    merged.push({ ...s })
  }
  return merged
}

export function scrubText(text: string, modelFound: string[] = []) {
  const spans = findSpans(text, modelFound)
  let out = ''
  let cursor = 0
  const identifiers: Identifier[] = []
  for (const s of spans) {
    out += text.slice(cursor, s.start) + `[${s.kind.toUpperCase()}]`
    identifiers.push({ kind: s.kind, text: text.slice(s.start, s.end), by: s.by })
    cursor = s.end
  }
  out += text.slice(cursor)
  return { scrubbed: out, spans, identifiers }
}

export function readAge(text: string): number | undefined {
  const m = /\bage\s*(?:\/\s*(?:sex|gender))?\s*[:\-]?\s*(\d{1,3})\s*(days?|weeks?|wks?|months?|mos?)?\b/i.exec(text)
  const n = m ? Number(m[1]) : NaN
  if (!(n > 0)) return undefined
  const unit = m?.[2]?.toLowerCase() ?? ''
  if (unit.startsWith('d')) return n / 365
  if (unit.startsWith('w')) return n / 52
  if (unit.startsWith('m')) return n / 12
  return n < 120 ? n : undefined
}

export function readSex(text: string): string | undefined {
  const m = /\b(?:sex|gender)\s*[:\-]?\s*(male|female|m|f)\b/i.exec(text) ?? /\b\d{1,3}\s*(?:y|yrs?|years?)?\s*\/\s*(male|female|m|f)\b/i.exec(text)
  if (!m) return undefined
  return /^m/i.test(m[1]) ? 'male' : 'female'
}

export function ageBand(age?: number): string {
  if (age === undefined || !(age > 0)) return 'adult (age withheld)'
  if (age < 2) return 'infant'
  if (age < 13) return 'child'
  if (age < 18) return 'teen'
  const lo = Math.floor(age / 10) * 10
  return age >= 80 ? '80+' : `${lo}-${lo + 9}`
}

const SAFE_TEXT = /^[\p{L}\p{N}\s.,%/()\-+<>=:μµ^*'·×–—≤≥]{0,80}$/u

/**
 * Builds the outbound packet and enforces the boundary: every field is
 * re-checked by the rules, and anything that looks like identity is dropped.
 */
export function buildPacket(
  panel: string,
  analytes: Analyte[],
  identifiers: Identifier[],
  age?: number,
  sex?: string,
): { packet: Packet; dropped: string[] } {
  const known = identifiers.map((i) => i.text.toLowerCase()).filter((t) => t.length > 2)
  const dropped: string[] = []
  const leaks = (s: string) => {
    const low = s.toLowerCase()
    if (known.some((k) => low.includes(k))) return true
    if (!SAFE_TEXT.test(s)) return true
    return findSpans(s).length > 0 || /@/.test(s)
  }
  const clean = analytes.filter((a) => {
    const bad = !a.name.trim() || /[<>:=]/.test(a.name) || [a.name, a.value, a.unit, a.range].some(leaks)
    if (bad) dropped.push(a.name || '(blank)')
    return !bad
  })
  return {
    packet: {
      panel: leaks(panel) ? 'Lab panel' : panel,
      ageBand: ageBand(age),
      sex: sex === 'male' || sex === 'female' ? sex : 'not stated',
      analytes: clean.slice(0, 40),
    },
    dropped,
  }
}

/** Reads 7,400 and 1,50,000 as whole numbers, and 4,8 as 4.8. */
const plain = (s: string) =>
  s.replace(/\d{1,3}(?:(?:,\d{3})+|(?:,\d{2})+,\d{3})(?!\d)/g, (n) => n.replace(/,/g, '')).replace(/(\d),(?=\d)/g, '$1.')

const NUM = String.raw`(-?\d+(?:\.\d+)?)`
const BETWEEN = new RegExp(String.raw`${NUM}\s*(?:-|–|—|to)\s*${NUM}`, 'i')
const UNDER = new RegExp(String.raw`(<=|≤|<|up to|upto|less than|below)\s*${NUM}`, 'i')
const OVER = new RegExp(String.raw`(>=|≥|>|more than|above)\s*${NUM}`, 'i')

type Bounds = { lo: number; hi: number; kind: 'between' } | { lo: number; hi: number; kind: 'under' | 'over'; strict: boolean }

function bounds(range: string): Bounds | null {
  const r = plain(range)
  const between = BETWEEN.exec(r)
  if (between) {
    const lo = Number(between[1])
    const hi = Number(between[2])
    return hi > lo ? { lo, hi, kind: 'between' } : null
  }
  const under = UNDER.exec(r)
  if (under) {
    const hi = Number(under[2])
    return hi > 0 ? { lo: 0, hi, kind: 'under', strict: !/<=|≤|up ?to/i.test(under[1]) } : null
  }
  const over = OVER.exec(r)
  if (over) {
    const lo = Number(over[2])
    return { lo, hi: lo * 2 || 1, kind: 'over', strict: !/>=|≥/.test(over[1]) }
  }
  return null
}

const valueOf = (a: Analyte) => parseFloat(plain(a.value))

/** Where the value sits relative to its reference range, 0..1 (0.25-0.75 is in range). */
export function rangePosition(a: Analyte): number | null {
  const v = valueOf(a)
  const b = bounds(a.range)
  if (Number.isNaN(v) || !b) return null
  const p = 0.25 + ((v - b.lo) / (b.hi - b.lo)) * 0.5
  return Math.max(0.04, Math.min(0.96, p))
}

export function flagFromRange(a: Analyte): Analyte['flag'] {
  const v = valueOf(a)
  const b = bounds(a.range)
  if (Number.isNaN(v) || !b) return a.flag
  if (b.kind === 'under') return v > b.hi || (b.strict && v === b.hi) ? 'high' : 'normal'
  if (b.kind === 'over') return v < b.lo || (b.strict && v === b.lo) ? 'low' : 'normal'
  return v < b.lo ? 'low' : v > b.hi ? 'high' : 'normal'
}
