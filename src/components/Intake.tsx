import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { LANGUAGES, SAMPLES } from '../lib/samples'
import { sfx } from '../lib/sound'
import type { DeviceState, PrivacyMode, ReportInput } from '../lib/types'
import { Button } from './Shell'

const STEPS = [
  { n: '01', t: 'Read on your device', d: 'Gemini Nano inside Chrome reads the report. Names, IDs and contacts are sealed before anything else happens.', c: 'text-device' },
  { n: '02', t: 'Inspect the airlock', d: 'You see the exact packet that may leave: test values, an age band, nothing that says who you are.', c: 'text-fog' },
  { n: '03', t: 'Explain in the cloud', d: 'Cloud Gemini explains the anonymous values in your language. Offline, the on-device model takes over.', c: 'text-cloud' },
]

export function Intake(props: {
  device: DeviceState
  privacy: PrivacyMode
  setPrivacy: (p: PrivacyMode) => void
  language: string
  setLanguage: (l: string) => void
  configured: boolean
  onStart: (input: ReportInput) => void
}) {
  const [text, setText] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const takeFile = (file?: File | null) => {
    if (!file) return
    if (/^image\/(png|jpe?g)$/.test(file.type)) {
      props.onStart({ kind: 'image', file, previewUrl: URL.createObjectURL(file), label: file.name })
    } else if (file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name)) {
      void file.text().then((t) => props.onStart({ kind: 'text', text: t, label: file.name }))
    } else {
      sfx.warn()
      alert('Veil reads JPEG or PNG photos and plain text. Take a screenshot of a PDF page to use it.')
    }
  }

  return (
    <motion.section
      key="intake"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24, filter: 'blur(8px)' }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className="mx-auto grid max-w-6xl gap-12 px-6 pb-24 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16"
    >
      <div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-mist">
          <span className="h-1.5 w-1.5 rounded-full bg-device" /> Hybrid AI · on-device first, cloud by consent
        </motion.p>
        <h1 className="font-serif text-[clamp(44px,6.4vw,84px)] leading-[0.98] tracking-[-0.02em]">
          Understand your lab report.
          <br />
          <span className="shimmer-text italic">Keep your identity.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-mist">
          People paste blood reports into chatbots with their name, phone number and patient ID still on the page. Veil reads the report inside your
          browser, seals who you are, and lets only anonymous numbers cross to the cloud.
        </p>

        <div className="mt-10 grid gap-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.12 }}
              className="flex gap-4 rounded-2xl border border-white/5 bg-white/[0.025] p-4"
            >
              <span className={`font-mono text-[12px] ${s.c}`}>{s.n}</span>
              <div>
                <p className={`text-[15px] font-semibold ${s.c}`}>{s.t}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-mist">{s.d}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 30, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.25, duration: 0.8 }} className="glass rounded-[28px] p-6 sm:p-7">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            takeFile(e.dataTransfer.files[0])
          }}
          onClick={() => fileRef.current?.click()}
          onMouseEnter={() => sfx.hover()}
          className={`group cursor-pointer rounded-2xl border border-dashed p-6 text-center transition ${drag ? 'border-device bg-device/10' : 'border-white/15 hover:border-device/60 hover:bg-white/[0.03]'}`}
        >
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 3 }} className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-device/10 text-2xl text-device">
            ⇪
          </motion.div>
          <p className="text-[15px] font-semibold">Drop a photo of your report</p>
          <p className="mt-1 text-[12.5px] text-mist">JPEG or PNG. It is read inside this browser tab.</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,text/plain" hidden onChange={(e) => takeFile(e.target.files?.[0])} />
        </div>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-mist/70">
          <span className="h-px flex-1 bg-white/10" /> or paste the text <span className="h-px flex-1 bg-white/10" />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the report text here…"
          spellCheck={false}
          className="scroll-thin h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-[12px] leading-relaxed text-fog placeholder:text-mist/50 focus:border-device/60 focus:outline-none"
        />

        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-mist/70">No report at hand? Try an invented one</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onMouseEnter={() => sfx.hover()}
                onClick={() => {
                  sfx.select()
                  setText(s.text)
                }}
                className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-left text-[12.5px] transition hover:border-device/50 hover:bg-device/10"
              >
                <span className="font-semibold">{s.label}</span> <span className="text-mist">· {s.hint}</span>
              </button>
            ))}
            <button
              onMouseEnter={() => sfx.hover()}
              onClick={async () => {
                sfx.select()
                const blob = await (await fetch('/samples/report-photo.png')).blob()
                takeFile(new File([blob], 'report-photo.png', { type: 'image/png' }))
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-[12.5px] transition hover:border-device/50 hover:bg-device/10"
            >
              <span className="font-semibold">Photo</span> <span className="text-mist">· scanned page</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.2em] text-mist/70">Explain in</span>
            <select
              value={props.language}
              onChange={(e) => {
                sfx.tap()
                props.setLanguage(e.target.value)
              }}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[13.5px] focus:border-device/60 focus:outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l} className="bg-ink-2">
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.2em] text-mist/70">Who may read the raw report</span>
            <div className="relative grid grid-cols-2 rounded-xl border border-white/10 bg-black/30 p-1 text-[12.5px] font-medium">
              {(['strict', 'hybrid'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    sfx.tap()
                    props.setPrivacy(p)
                  }}
                  className={`relative z-10 rounded-lg px-2 py-2 transition ${props.privacy === p ? 'text-ink' : 'text-mist hover:text-fog'}`}
                >
                  {props.privacy === p && <motion.span layoutId="privacy-thumb" className={`absolute inset-0 -z-10 rounded-lg ${p === 'strict' ? 'bg-device' : 'bg-cloud'}`} />}
                  {p === 'strict' ? 'Device only' : 'Device, then cloud'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
          {props.privacy === 'strict'
            ? 'The raw report is read with ONLY_ON_DEVICE. If this browser has no local model, Veil stops and asks you.'
            : 'The raw report is read with PREFER_ON_DEVICE. Without a local model, rule-scrubbed text goes to the cloud; photos always ask first.'}
          {props.device !== 'ready' && props.privacy === 'strict' && <span className="text-amber"> No local model is ready here yet.</span>}
        </p>

        <Button className="mt-6 w-full" disabled={!text.trim() || !props.configured} onClick={() => props.onStart({ kind: 'text', text, label: 'Pasted report' })}>
          Read it privately <span aria-hidden>→</span>
        </Button>
        {!props.configured && <p className="mt-3 text-center text-[12px] text-amber">This build has no Firebase config. Add the VITE_FIREBASE_* values from .env.example.</p>}
        <p className="mt-4 text-center text-[11.5px] text-mist/70">Veil explains results. It does not diagnose, and it is not a substitute for your doctor.</p>
      </motion.div>
    </motion.section>
  )
}
