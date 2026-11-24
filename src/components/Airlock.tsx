import { motion } from 'framer-motion'
import { useEffect, useMemo } from 'react'
import { sfx } from '../lib/sound'
import type { Span } from '../lib/scrub'
import type { Identifier, Packet, ReportInput, Source } from '../lib/types'
import { Button, ShieldIcon, SourceBadge } from './Shell'

/** The report as a sheet of paper; identifiers get sealed with animated bars. */
export function Document({ input, text, spans, scanning }: { input: ReportInput; text: string; spans: Span[]; scanning: boolean }) {
  const pieces = useMemo(() => {
    const out: { t: string; span?: Span }[] = []
    let c = 0
    for (const s of spans) {
      if (s.start > c) out.push({ t: text.slice(c, s.start) })
      out.push({ t: text.slice(s.start, s.end), span: s })
      c = s.end
    }
    out.push({ t: text.slice(c) })
    return out
  }, [text, spans])

  let idx = 0
  return (
    <div className="paper relative overflow-hidden rounded-2xl shadow-[0_40px_90px_-40px_#000]">
      {input.kind === 'image' ? (
        <img src={input.previewUrl} alt="Your report" className={`block max-h-[520px] w-full object-contain object-top transition duration-700 ${scanning ? '' : 'blur-[7px] saturate-50'}`} />
      ) : (
        <pre className="scroll-thin max-h-[520px] overflow-auto whitespace-pre p-6 font-mono text-[11px] leading-[1.55em]">
          {pieces.map((p, i) => {
            if (!p.span) return <span key={i}>{p.t}</span>
            const order = idx++
            return (
              <span key={i} className="relative inline-block">
                <span className="opacity-90">{p.t}</span>
                <motion.span
                  title={`${p.span.kind} · sealed on this device`}
                  className="absolute -inset-x-0.5 inset-y-[1px] origin-left rounded-[3px] bg-[#16211e]"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.5 + order * 0.13, duration: 0.28, ease: 'easeOut' }}
                  onAnimationStart={() => setTimeout(() => sfx.seal(order), (0.5 + order * 0.13) * 1000)}
                />
              </span>
            )
          })}
        </pre>
      )}
      {input.kind === 'image' && !scanning && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="rounded-full bg-ink/85 px-4 py-2 text-[12.5px] font-medium text-device">◉ Photo stays on this device</span>
        </div>
      )}
      {scanning && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 h-24"
          style={{ background: 'linear-gradient(180deg, transparent, #7cf5d055 70%, #7cf5d0 99%, transparent)' }}
          initial={{ top: '-20%' }}
          animate={{ top: ['-20%', '100%'] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}

export function Reading({ input, text, spans }: { input: ReportInput; text: string; spans: Span[] }) {
  useEffect(() => {
    sfx.scan()
    const t = setInterval(() => sfx.scan(), 1700)
    return () => clearInterval(t)
  }, [])
  return (
    <motion.section key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-3xl px-6 pb-24 pt-10">
      <div className="mb-6 text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-device">Step 1 · on this device</p>
        <h2 className="mt-2 font-serif text-5xl">Reading, and sealing who you are</h2>
        <p className="mt-3 text-mist">Nothing has left this browser.</p>
      </div>
      <Document input={input} text={text} spans={spans} scanning />
    </motion.section>
  )
}

export function Airlock(props: {
  input: ReportInput
  text: string
  spans: Span[]
  identifiers: Identifier[]
  packet: Packet
  dropped: string[]
  readSource: Source
  sending: boolean
  canOffline: boolean
  online: boolean
  onSend: () => void
  onOffline: () => void
  onBack: () => void
}) {
  const { packet, identifiers } = props
  return (
    <motion.section key="airlock" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, filter: 'blur(8px)' }} className="mx-auto max-w-6xl px-6 pb-24 pt-8">
      <div className="mb-8 text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-fog/80">Step 2 · the airlock</p>
        <h2 className="mt-2 font-serif text-5xl">This is everything that would leave</h2>
        <p className="mx-auto mt-3 max-w-2xl text-mist">Left stays with you. Right is the whole packet for the cloud model. Check it, then open the airlock yourself.</p>
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-[1.25fr_auto_1fr]">
        <div className="glass rounded-[26px] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-device">Stays on this device</h3>
            <SourceBadge source={props.readSource} />
          </div>
          <Document input={props.input} text={props.text} spans={props.spans} scanning={false} />
          <div className="mt-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-mist/70">{identifiers.length} identifiers sealed</p>
            <div className="flex flex-wrap gap-1.5">
              {identifiers.length === 0 && <span className="text-[12.5px] text-mist">None found in the text. The packet is still rebuilt from values only.</span>}
              {identifiers.map((id, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-identity/30 bg-identity/10 px-2.5 py-1 text-[11.5px] text-identity"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-identity" /> {id.kind}
                  {id.by === 'model' && <span className="text-identity/60">· model</span>}
                </motion.span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center lg:w-24">
          <div className="absolute inset-y-0 left-1/2 hidden w-px bg-gradient-to-b from-transparent via-white/25 to-transparent lg:block" />
          <motion.div
            animate={props.sending ? { rotate: 90, scale: 1.15, borderColor: '#7ab8ff' } : { rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 12 }}
            className="relative z-10 grid h-20 w-20 place-items-center rounded-full border-2 border-white/25 bg-ink-2 text-2xl"
          >
            <motion.span animate={{ opacity: props.sending ? [1, 0.3, 1] : 1 }} transition={{ repeat: Infinity, duration: 0.7 }}>
              {props.sending ? '⇢' : <ShieldIcon size={30} />}
            </motion.span>
          </motion.div>
          {props.sending &&
            packet.analytes.slice(0, 10).map((_, i) => (
              <motion.span
                key={i}
                className="absolute z-20 h-2 w-2 rounded-full bg-cloud shadow-[0_0_12px_#7ab8ff]"
                initial={{ x: -70, y: (i - 5) * 9, opacity: 0 }}
                animate={{ x: 70, opacity: [0, 1, 0] }}
                transition={{ duration: 0.9, delay: i * 0.11, repeat: Infinity }}
              />
            ))}
        </div>

        <div className="glass rounded-[26px] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-cloud">The packet for the cloud</h3>
            <span className="rounded-full border border-cloud/30 bg-cloud/10 px-2.5 py-1 text-[11.5px] font-medium text-cloud">0 identifiers</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
              <Chip k="panel" v={packet.panel} />
              <Chip k="age band" v={packet.ageBand} />
              <Chip k="sex" v={packet.sex} />
            </div>
            <div className="scroll-thin max-h-[330px] overflow-auto">
              <table className="w-full text-left font-mono text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-wider text-mist/70">
                  <tr>
                    <th className="pb-2 font-normal">test</th>
                    <th className="pb-2 font-normal">value</th>
                    <th className="pb-2 font-normal">range</th>
                  </tr>
                </thead>
                <tbody>
                  {packet.analytes.map((a, i) => (
                    <motion.tr
                      key={i}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.07 }}
                      onAnimationStart={() => setTimeout(() => sfx.packet(i), (0.25 + i * 0.07) * 1000)}
                      className="border-t border-white/5"
                    >
                      <td className="py-1.5 pr-2 text-fog">{a.name}</td>
                      <td className={`py-1.5 pr-2 ${a.flag === 'normal' ? 'text-device' : a.flag === 'unknown' ? 'text-fog' : 'text-amber'}`}>
                        {a.value} <span className="text-mist">{a.unit}</span>
                      </td>
                      <td className="py-1.5 text-mist">{a.range || '—'}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {props.dropped.length > 0 && (
            <p className="mt-3 text-[12px] text-amber">Held back by the boundary check: {props.dropped.join(', ')}</p>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-mist">
            Rebuilt from numbers only, then re-checked by local rules. No free text from your report is forwarded.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button variant="ghost" onClick={props.onBack} disabled={props.sending}>
          ← Start over
        </Button>
        <Button variant="ghost" onClick={props.onOffline} disabled={props.sending || !props.canOffline}>
          ◉ Keep it all on this device
        </Button>
        <Button variant="cloud" onClick={props.onSend} disabled={props.sending || packet.analytes.length === 0}>
          {props.sending ? 'Explaining…' : props.online ? 'Open the airlock · explain in the cloud' : 'Offline · explain on this device'} <span aria-hidden>⇢</span>
        </Button>
      </div>
      {!props.canOffline && <p className="mt-3 text-center text-[12px] text-mist/70">Fully on-device explanations need Gemini Nano in Chrome desktop.</p>}
    </motion.section>
  )
}

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1">
      <span className="text-mist">{k}</span> <span className="font-medium text-fog">{v}</span>
    </span>
  )
}
