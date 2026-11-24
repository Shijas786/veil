import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ask } from '../lib/ai'
import { rangePosition } from '../lib/scrub'
import { sfx } from '../lib/sound'
import type { Analyte, Explanation, LedgerEntry, Packet, SavedReport, Source } from '../lib/types'
import { Button, SourceBadge } from './Shell'

const URGENCY = {
  routine: { t: 'Routine', d: 'Worth mentioning at your next visit', c: 'text-device border-device/30 bg-device/10' },
  soon: { t: 'Book a visit soon', d: 'Share this with your doctor in the coming days', c: 'text-amber border-amber/30 bg-amber/10' },
  urgent: { t: 'Talk to a doctor now', d: 'Do not wait for a routine appointment', c: 'text-identity border-identity/30 bg-identity/10' },
}
const STATUS = {
  low: { t: 'Low', c: 'text-amber', b: 'bg-amber' },
  high: { t: 'High', c: 'text-amber', b: 'bg-amber' },
  normal: { t: 'In range', c: 'text-device', b: 'bg-device' },
  unknown: { t: 'No range', c: 'text-mist', b: 'bg-mist' },
}

function RangeBar({ a, delay }: { a: Analyte; delay: number }) {
  const pos = rangePosition(a)
  if (pos === null) return <div className="h-[22px]" />
  const pct = pos * 100
  const off = pos < 0.25 || pos > 0.75
  return (
    <div className="relative mt-4 h-[22px]">
      <div className="absolute inset-x-0 top-2 h-1.5 rounded-full bg-white/10" />
      <div className="absolute left-1/4 right-1/4 top-2 h-1.5 rounded-full bg-device/40" />
      <motion.div
        className={`absolute top-0 h-[22px] w-[3px] -translate-x-1/2 rounded-full ${off ? 'bg-amber shadow-[0_0_14px_#ffc46b]' : 'bg-device shadow-[0_0_14px_#7cf5d0]'}`}
        initial={{ left: '50%', opacity: 0 }}
        animate={{ left: `${pct}%`, opacity: 1 }}
        transition={{ delay, type: 'spring', stiffness: 70, damping: 11 }}
      />
    </div>
  )
}

export function Results(props: {
  packet: Packet
  explanation: Explanation
  source: Source
  language: string
  ledger: LedgerEntry[]
  saved: boolean
  onLedger: () => void
  onRestart: () => void
}) {
  const { explanation: ex, packet } = props
  const u = URGENCY[ex.urgency] ?? URGENCY.routine
  const [q, setQ] = useState('')
  const [thread, setThread] = useState<{ q: string; a: string; source?: Source }[]>([])
  const [busy, setBusy] = useState(false)
  const left = props.ledger.filter((l) => l.leftDevice).length
  const exposed = props.ledger.some((l) => l.identityExposed)

  useEffect(() => {
    sfx.done()
  }, [])

  const send = async (question: string) => {
    if (!question.trim() || busy) return
    setBusy(true)
    setQ('')
    setThread((t) => [...t, { q: question, a: '' }])
    try {
      const source = await ask(question, packet, ex, props.language, (text) =>
        setThread((t) => t.map((m, i) => (i === t.length - 1 ? { ...m, a: text } : m))),
      )
      setThread((t) => t.map((m, i) => (i === t.length - 1 ? { ...m, source } : m)))
    } catch (e) {
      sfx.warn()
      setThread((t) => t.map((m, i) => (i === t.length - 1 ? { ...m, a: e instanceof Error ? e.message : 'Something went wrong.' } : m)))
    }
    setBusy(false)
  }

  return (
    <motion.section key="results" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mx-auto max-w-6xl px-6 pb-28 pt-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${u.c}`}>{u.t}</span>
            <span className="text-[12.5px] text-mist">{u.d}</span>
          </div>
          <motion.h2 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-4 font-serif text-[clamp(34px,4.6vw,58px)] leading-[1.04]">
            {ex.headline}
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-4 max-w-2xl text-[16.5px] leading-relaxed text-mist">
            {ex.summary}
          </motion.p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {packet.analytes.map((a, i) => {
              const item = ex.items.find((it) => it.name.toLowerCase() === a.name.toLowerCase()) ?? ex.items[i]
              const s = STATUS[a.flag] ?? STATUS.unknown
              return (
                <motion.article
                  key={a.name + i}
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -4 }}
                  transition={{ delay: 0.45 + i * 0.07 }}
                  onAnimationStart={() => setTimeout(() => sfx.reveal(i), (0.45 + i * 0.07) * 1000)}
                  className="glass rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14.5px] font-semibold">{a.name}</h3>
                    <span className={`flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold ${s.c}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${s.b}`} />
                      {s.t}
                    </span>
                  </div>
                  <p className="mt-2 font-serif text-[34px] leading-none">
                    {a.value} <span className="font-sans text-[13px] text-mist">{a.unit}</span>
                  </p>
                  <RangeBar a={a} delay={0.7 + i * 0.07} />
                  <p className="mt-1 font-mono text-[10.5px] text-mist/80">{a.range ? `usual range ${a.range}` : 'no range printed'}</p>
                  {item && (
                    <>
                      <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{item.meaning}</p>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-fog">{item.note}</p>
                    </>
                  )}
                </motion.article>
              )
            })}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <List title="Ask your doctor" items={ex.questions} tone="text-cloud" mark="?" />
            <List title="Everyday notes" items={ex.habits} tone="text-device" mark="·" />
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="glass rounded-3xl p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-mist/70">Privacy receipt</p>
            <p className={`mt-2 font-serif text-[28px] leading-tight ${exposed ? 'text-amber' : 'text-device'}`}>
              {exposed ? 'Your photo went to the cloud, with your consent.' : left === 0 ? 'Nothing left this device.' : 'Your identity never left this device.'}
            </p>
            <div className="mt-4 space-y-2.5">
              {props.ledger.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="text-mist">{l.stage}</span>
                  <SourceBadge source={l.source} small />
                </div>
              ))}
            </div>
            <Button variant="ghost" className="mt-5 w-full !py-2.5 !text-[13px]" onClick={props.onLedger}>
              See exactly what was sent
            </Button>
            <p className="mt-3 text-center text-[11.5px] text-mist/70">
              {props.saved ? 'Anonymous values saved to your private history.' : 'Sources are reported by Firebase AI Logic for each call.'}
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }} className="glass rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-[14.5px] font-semibold">Ask a follow-up</p>
              <span className="text-[11px] text-mist">on-device first</span>
            </div>
            <div className="scroll-thin mt-3 max-h-72 space-y-3 overflow-auto">
              {thread.length === 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(ex.questions.slice(0, 2).length ? ex.questions.slice(0, 2) : ['What should I eat?']).map((s) => (
                    <button key={s} onClick={() => void send(s)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[12px] text-mist transition hover:border-device/40 hover:text-fog">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {thread.map((m, i) => (
                <div key={i}>
                  <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-white/10 px-3 py-2 text-[13px]">{m.q}</p>
                  <div className="mt-2 text-[13px] leading-relaxed text-fog">
                    {m.a || <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="text-mist">thinking…</motion.span>}
                    {m.source && (
                      <div className="mt-1.5">
                        <SourceBadge source={m.source} small />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send(q)
              }}
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="What does low ferritin mean?"
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-2.5 text-[13px] placeholder:text-mist/50 focus:border-device/60 focus:outline-none"
              />
              <button disabled={busy || !q.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-device text-ink disabled:opacity-40" aria-label="Ask">
                ↑
              </button>
            </form>
          </motion.div>

          <Button variant="ghost" className="w-full" onClick={props.onRestart}>
            Read another report
          </Button>
        </aside>
      </div>
    </motion.section>
  )
}

function List({ title, items, tone, mark }: { title: string; items: string[]; tone: string; mark: string }) {
  if (!items?.length) return null
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className={`text-[14.5px] font-semibold ${tone}`}>{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((q, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 + i * 0.08 }} className="flex gap-2.5 text-[13.5px] leading-relaxed text-fog">
            <span className={`font-mono ${tone}`}>{mark}</span>
            {q}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

export function LedgerView({ ledger }: { ledger: LedgerEntry[] }) {
  if (!ledger.length) return <p className="text-mist">No model has been called yet in this session.</p>
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-relaxed text-mist">
        Every model call Veil made, the inference mode it asked Firebase AI Logic for, and where the SDK says it actually ran. This ledger lives in memory and is
        gone when you close the tab.
      </p>
      {ledger.map((l, i) => (
        <motion.div key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold">{l.stage}</p>
            <SourceBadge source={l.source} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-mist">
            <span>mode {l.mode}</span>
            <span>{Math.round(l.ms)} ms</span>
            <span className={l.leftDevice ? 'text-cloud' : 'text-device'}>{l.leftDevice ? 'left the device' : 'stayed on device'}</span>
            <span className={l.identityExposed ? 'text-identity' : 'text-device'}>{l.identityExposed ? 'identity included' : 'no identity'}</span>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] text-mist hover:text-fog">Exact payload ({l.payload.length.toLocaleString()} characters{l.hadImage ? ' + image' : ''})</summary>
            <pre className="scroll-thin mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 font-mono text-[10.5px] leading-relaxed text-fog/90">{l.payload}</pre>
          </details>
        </motion.div>
      ))}
    </div>
  )
}

export function HistoryView({ reports, onDelete }: { reports: SavedReport[] | null; onDelete: (id: string) => void }) {
  if (reports === null) return <p className="text-mist">Loading…</p>
  if (!reports.length) return <p className="text-mist">Nothing saved yet. Only anonymous values are ever stored, under an anonymous account.</p>
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-mist">Stored in Firestore under an anonymous sign-in. No names, no report text, no images.</p>
      {reports.map((r) => (
        <div key={r.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] text-mist">{new Date(r.createdAt).toLocaleString()} · {r.panel}</p>
              <p className="mt-1 font-serif text-[21px] leading-snug">{r.headline}</p>
            </div>
            <button onClick={() => onDelete(r.id)} className="text-[12px] text-mist hover:text-identity">Delete</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.analytes.slice(0, 8).map((a, i) => (
              <span key={i} className={`rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10.5px] ${a.flag === 'normal' ? 'text-device' : a.flag === 'unknown' ? 'text-mist' : 'text-amber'}`}>
                {a.name} {a.value}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
