import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Airlock, Reading } from './components/Airlock'
import { Intake } from './components/Intake'
import { HistoryView, LedgerView, Results } from './components/Results'
import { Backdrop, Button, ClockIcon, DevicePill, Drawer, Logo, Modal, ShieldIcon, SoundIcon } from './components/Shell'
import { deviceState, explain, readReport, record, resetLedger, subscribeLedger, VeilError, warmDeviceModel } from './lib/ai'
import { deleteReport, isConfigured, loadReports, saveReport } from './lib/firebase'
import { buildPacket, flagFromRange, readAge, readSex, scrubText, type Span } from './lib/scrub'
import { setSound, sfx, soundOn, startPad, stopPad } from './lib/sound'
import type { DeviceState, Explanation, Identifier, LedgerEntry, Packet, PrivacyMode, ReportInput, SavedReport, Source } from './lib/types'

type Stage = 'intake' | 'reading' | 'airlock' | 'explaining' | 'results'
interface Sealed {
  spans: Span[]
  identifiers: Identifier[]
  packet: Packet
  dropped: string[]
  source: Source
}

export default function App() {
  const [stage, setStage] = useState<Stage>('intake')
  const [device, setDevice] = useState<DeviceState>('unsupported')
  const [progress, setProgress] = useState(0)
  const [privacy, setPrivacy] = useState<PrivacyMode>('strict')
  const [language, setLanguage] = useState('English')
  const [input, setInput] = useState<ReportInput | null>(null)
  const [sealed, setSealed] = useState<Sealed | null>(null)
  const [result, setResult] = useState<{ explanation: Explanation; source: Source } | null>(null)
  const [saved, setSaved] = useState(false)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [consent, setConsent] = useState<ReportInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<'ledger' | 'history' | null>(null)
  const [history, setHistory] = useState<SavedReport[] | null>(null)
  const [sound, setSoundState] = useState(soundOn())
  const [online, setOnline] = useState(navigator.onLine)
  const run = useRef(0)

  useEffect(() => subscribeLedger(setLedger), [])
  useEffect(() => {
    void deviceState().then(setDevice)
    const on = () => setOnline(navigator.onLine)
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
    }
  }, [])

  const enableDevice = useCallback(async () => {
    setDevice('downloading')
    try {
      await warmDeviceModel(setProgress)
    } catch {
      /* state below reports the truth */
    }
    setDevice(await deviceState())
  }, [])

  const fail = (e: unknown) => {
    stopPad()
    sfx.warn()
    setError(e instanceof Error ? e.message : String(e))
    setStage('intake')
  }

  const start = async (inp: ReportInput, allowCloud = false) => {
    const id = ++run.current
    const text = inp.text ?? ''
    const rules = scrubText(text)
    setError(null)
    setConsent(null)
    setInput(inp)
    setSealed(null)
    setResult(null)
    setSaved(false)
    if (!allowCloud) {
      resetLedger()
      if (inp.kind === 'text')
        record({ stage: 'Seal identifiers', mode: 'deterministic rules', source: 'local_rules', ms: 1, payload: text, hadImage: false, leftDevice: false, identityExposed: false })
    }
    // A photo cannot be rule-scrubbed, so it never reaches the cloud without an explicit yes.
    if (inp.kind === 'image' && !allowCloud && device !== 'ready' && privacy === 'hybrid') {
      setConsent(inp)
      return
    }
    setStage('reading')
    startPad()
    const began = Date.now()
    try {
      const { extraction, source } = await readReport({
        text: inp.kind === 'text' ? rules.scrubbed : undefined,
        image: inp.file,
        privacy,
        allowCloud,
      })
      if (id !== run.current) return
      const full = scrubText(text, extraction.residualIdentifiers)
      const identifiers: Identifier[] =
        inp.kind === 'image' ? extraction.residualIdentifiers.map((t) => ({ kind: 'Identifier', text: t, by: 'model' as const })) : full.identifiers
      const analytes = extraction.analytes.map((a) => ({ ...a, flag: flagFromRange(a) }))
      const built = buildPacket(extraction.panel, analytes, identifiers, readAge(text) ?? (extraction.age || undefined), readSex(text) ?? extraction.sex)
      if (!built.packet.analytes.length) throw new VeilError('bad_output', 'Veil could not find any test results in that. Try a clearer photo or paste the text.')
      await new Promise((r) => setTimeout(r, Math.max(0, 2600 - (Date.now() - began))))
      if (id !== run.current) return
      stopPad()
      setSealed({ spans: full.spans, identifiers, packet: built.packet, dropped: built.dropped, source })
      sfx.select()
      setStage('airlock')
    } catch (e) {
      if (id !== run.current) return
      stopPad()
      if (e instanceof VeilError && e.code === 'needs_device_model') {
        sfx.warn()
        setStage('intake')
        setConsent(inp)
      } else fail(e)
    }
  }

  const runExplain = async (offline: boolean) => {
    if (!sealed) return
    const id = run.current
    setStage('explaining')
    sfx.airlock()
    startPad()
    try {
      const r = await explain(sealed.packet, language, offline)
      if (id !== run.current) return
      stopPad()
      setResult(r)
      setStage('results')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      void saveReport(sealed.packet, r.explanation)
        .then((docId) => setSaved(Boolean(docId)))
        .catch(() => {})
    } catch (e) {
      if (id !== run.current) return
      stopPad()
      sfx.warn()
      setError(e instanceof Error ? e.message : String(e))
      setStage('airlock')
    }
  }

  const restart = () => {
    run.current++
    stopPad()
    if (input?.previewUrl) URL.revokeObjectURL(input.previewUrl)
    setInput(null)
    setSealed(null)
    setResult(null)
    setError(null)
    setStage('intake')
    resetLedger()
  }

  const openHistory = () => {
    setDrawer('history')
    setHistory(null)
    loadReports()
      .then(setHistory)
      .catch(() => setHistory([]))
  }

  return (
    <div className="grain relative min-h-screen">
      <Backdrop stage={stage} />
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3.5">
          <button onClick={restart} aria-label="Veil home">
            <Logo />
          </button>
          <div className="flex items-center gap-2">
            {!online && <span className="rounded-full border border-amber/30 bg-amber/10 px-3 py-1.5 text-[12px] font-medium text-amber">Offline</span>}
            <DevicePill state={device} progress={progress} onEnable={() => void enableDevice()} />
            <HeaderBtn label="Privacy ledger" onClick={() => setDrawer('ledger')}>
              <ShieldIcon />{ledger.length > 0 && <span className="ml-1 font-mono text-[11px]">{ledger.length}</span>}
            </HeaderBtn>
            <HeaderBtn label="Saved reports" onClick={openHistory}>
              <ClockIcon />
            </HeaderBtn>
            <HeaderBtn
              label={sound ? 'Mute sound' : 'Turn sound on'}
              onClick={() => {
                setSound(!sound)
                setSoundState(!sound)
                if (!sound) setTimeout(() => sfx.select(), 30)
              }}
            >
              <SoundIcon on={sound} />
            </HeaderBtn>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mx-auto mt-5 max-w-3xl px-6">
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-identity/30 bg-identity/10 px-4 py-3 text-[13.5px] text-identity">
              <span>{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss">
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        <AnimatePresence mode="wait">
          {stage === 'intake' && (
            <Intake key="intake" device={device} privacy={privacy} setPrivacy={setPrivacy} language={language} setLanguage={setLanguage} configured={isConfigured} onStart={(i) => void start(i)} />
          )}
          {stage === 'reading' && input && <Reading key="reading" input={input} text={input.text ?? ''} spans={scrubText(input.text ?? '').spans} />}
          {(stage === 'airlock' || stage === 'explaining') && input && sealed && (
            <Airlock
              key="airlock"
              input={input}
              text={input.text ?? ''}
              spans={sealed.spans}
              identifiers={sealed.identifiers}
              packet={sealed.packet}
              dropped={sealed.dropped}
              readSource={sealed.source}
              sending={stage === 'explaining'}
              canOffline={device === 'ready'}
              online={online}
              onSend={() => void runExplain(!online)}
              onOffline={() => void runExplain(true)}
              onBack={restart}
            />
          )}
          {stage === 'results' && sealed && result && (
            <Results key="results" packet={sealed.packet} explanation={result.explanation} source={result.source} language={language} ledger={ledger} saved={saved} onLedger={() => setDrawer('ledger')} onRestart={restart} />
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-white/5 px-6 py-6 text-center text-[12px] text-mist/70">
        Built with Firebase AI Logic hybrid inference · Gemini Nano on-device, Gemini in the cloud · Veil explains, it does not diagnose.
      </footer>

      <Modal open={Boolean(consent)} onClose={() => setConsent(null)}>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber">Your call</p>
        <h3 className="mt-2 font-serif text-[34px] leading-tight">This browser cannot read it locally.</h3>
        <p className="mt-3 text-[14px] leading-relaxed text-mist">
          {consent?.kind === 'image'
            ? 'There is no on-device model here, and a photo cannot be scrubbed by rules. Reading it in the cloud would send the whole image, including your name. Veil will not do that unless you say so.'
            : 'There is no on-device model here. Veil can send the rule-scrubbed text to the cloud instead: names, IDs, phone numbers and addresses are already replaced by placeholders on this device.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <Button variant="ghost" onClick={() => setConsent(null)}>
            Keep it here
          </Button>
          <Button variant="cloud" onClick={() => consent && void start(consent, true)}>
            {consent?.kind === 'image' ? 'Send the photo anyway' : 'Send scrubbed text'}
          </Button>
        </div>
      </Modal>

      <Drawer open={drawer === 'ledger'} title="Privacy ledger" onClose={() => setDrawer(null)}>
        <LedgerView ledger={ledger} />
      </Drawer>
      <Drawer open={drawer === 'history'} title="Saved reports" onClose={() => setDrawer(null)}>
        <HistoryView
          reports={history}
          onDelete={(id) => {
            setHistory((h) => h?.filter((r) => r.id !== id) ?? null)
            void deleteReport(id)
          }}
        />
      </Drawer>
    </div>
  )
}

function HeaderBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={() => {
        sfx.tap()
        onClick()
      }}
      className="glass flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-[15px] text-mist transition hover:text-fog"
    >
      {children}
    </button>
  )
}
