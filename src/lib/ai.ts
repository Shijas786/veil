import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
  type GenerativeModel,
  type Part,
} from 'firebase/ai'
import { app, remote } from './firebase'
import { scrubText } from './scrub'
import type { DeviceState, Explanation, Extraction, LedgerEntry, Packet, PrivacyMode, Source } from './types'

/**
 * Veil's hybrid routing, all through the Firebase AI Logic Hybrid Inference SDK:
 *
 *   READ     identity may be present  -> ONLY_ON_DEVICE (strict) / PREFER_ON_DEVICE (hybrid)
 *   EXPLAIN  anonymous packet only    -> PREFER_IN_CLOUD (falls back to on-device offline)
 *   ASK      follow-up about results  -> PREFER_ON_DEVICE
 *
 * Every call is written to a ledger with the source the SDK reports back.
 */

type Listener = (entries: LedgerEntry[]) => void
let ledger: LedgerEntry[] = []
const listeners = new Set<Listener>()
export const subscribeLedger = (fn: Listener) => {
  listeners.add(fn)
  fn(ledger)
  return () => void listeners.delete(fn)
}
export const resetLedger = () => {
  ledger = []
  listeners.forEach((l) => l(ledger))
}
export function record(e: Omit<LedgerEntry, 'id' | 'at'>) {
  ledger = [...ledger, { ...e, id: crypto.randomUUID(), at: Date.now() }]
  listeners.forEach((l) => l(ledger))
}

const ai = app ? getAI(app, { backend: new GoogleAIBackend() }) : null

// ---------- schemas (cloud: responseSchema, on-device: responseConstraint) ----------

const extractionSchema = Schema.object({
  properties: {
    panel: Schema.string({ description: 'Short name of the test panel, e.g. "Complete Blood Count"' }),
    analytes: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          value: Schema.string(),
          unit: Schema.string(),
          range: Schema.string({ description: 'Reference range exactly as printed, or empty' }),
          flag: Schema.enumString({ enum: ['low', 'normal', 'high', 'unknown'] }),
        },
      }),
    }),
    residualIdentifiers: Schema.array({
      items: Schema.string(),
      description: 'Any personal names, addresses, IDs or contact details still visible, copied verbatim',
    }),
    age: Schema.number({ description: 'Patient age in years, 0 if not stated' }),
    sex: Schema.enumString({ enum: ['male', 'female', 'unknown'] }),
  },
})

const extractionConstraint = {
  type: 'object',
  required: ['panel', 'analytes', 'residualIdentifiers', 'age', 'sex'],
  additionalProperties: false,
  properties: {
    panel: { type: 'string' },
    analytes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'value', 'unit', 'range', 'flag'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
          unit: { type: 'string' },
          range: { type: 'string' },
          flag: { type: 'string', enum: ['low', 'normal', 'high', 'unknown'] },
        },
      },
    },
    residualIdentifiers: { type: 'array', items: { type: 'string' } },
    age: { type: 'number' },
    sex: { type: 'string', enum: ['male', 'female', 'unknown'] },
  },
}

const explanationSchema = Schema.object({
  properties: {
    headline: Schema.string({ description: 'One reassuring, honest sentence, max 14 words' }),
    summary: Schema.string({ description: '2-3 plain sentences on the overall picture' }),
    urgency: Schema.enumString({ enum: ['routine', 'soon', 'urgent'] }),
    items: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string({ description: 'Analyte name exactly as given' }),
          status: Schema.enumString({ enum: ['low', 'normal', 'high', 'unknown'] }),
          meaning: Schema.string({ description: 'What this test measures, one short sentence, no jargon' }),
          note: Schema.string({ description: 'What this specific result may mean, one or two sentences' }),
        },
      }),
    }),
    questions: Schema.array({ items: Schema.string(), description: '3-4 questions to ask the doctor' }),
    habits: Schema.array({ items: Schema.string(), description: '2-4 gentle, general lifestyle notes' }),
  },
})

const explanationConstraint = {
  type: 'object',
  required: ['headline', 'summary', 'urgency', 'items', 'questions', 'habits'],
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    urgency: { type: 'string', enum: ['routine', 'soon', 'urgent'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'status', 'meaning', 'note'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['low', 'normal', 'high', 'unknown'] },
          meaning: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
    habits: { type: 'array', items: { type: 'string' } },
  },
}

// ---------- models ----------

function need(): NonNullable<typeof ai> {
  if (!ai) throw new VeilError('not_configured', 'Firebase is not configured for this build.')
  return ai
}

const readerMode = (privacy: PrivacyMode, allowCloud: boolean) =>
  privacy === 'strict' && !allowCloud ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE

const EN_OUT = [{ type: 'text' as const, languages: ['en'] }]

function readerModel(mode: InferenceMode): GenerativeModel {
  return getGenerativeModel(need(), {
    mode,
    onDeviceParams: {
      createOptions: { expectedInputs: [{ type: 'text' }, { type: 'image' }], expectedOutputs: EN_OUT },
      promptOptions: { responseConstraint: extractionConstraint },
    },
    inCloudParams: {
      model: remote('cloud_model'),
      generationConfig: { responseMimeType: 'application/json', responseSchema: extractionSchema, temperature: 0 },
    },
  })
}

function explainerModel(mode: InferenceMode): GenerativeModel {
  return getGenerativeModel(need(), {
    mode,
    onDeviceParams: { createOptions: { expectedOutputs: EN_OUT }, promptOptions: { responseConstraint: explanationConstraint } },
    inCloudParams: {
      model: remote('cloud_model'),
      generationConfig: { responseMimeType: 'application/json', responseSchema: explanationSchema, temperature: 0.3 },
    },
  })
}

function askModel(mode: InferenceMode): GenerativeModel {
  return getGenerativeModel(need(), {
    mode,
    onDeviceParams: { createOptions: { expectedOutputs: EN_OUT } },
    inCloudParams: { model: remote('cloud_model'), generationConfig: { temperature: 0.4 } },
  })
}

// ---------- device model status ----------

interface LanguageModelGlobal {
  availability(opts?: unknown): Promise<string>
}

/**
 * Some Chrome builds expose the Prompt API but never answer on machines that cannot run the
 * model. A hung probe is remembered so that no later call waits on the device forever.
 */
let deviceHung = false

export async function deviceState(): Promise<DeviceState> {
  const LM = (globalThis as { LanguageModel?: LanguageModelGlobal }).LanguageModel
  if (!LM) return 'unsupported'
  try {
    const a = await Promise.race([
      LM.availability({ expectedInputs: [{ type: 'text' }, { type: 'image' }], expectedOutputs: EN_OUT }),
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 4000)),
    ])
    deviceHung = a === 'hung'
    if (a === 'available') return 'ready'
    if (a === 'downloading') return 'downloading'
    if (a === 'downloadable') return 'downloadable'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** The mode actually handed to Firebase AI Logic. Only differs when the device probe hung. */
function effective(mode: InferenceMode): InferenceMode {
  if (!deviceHung) return mode
  if (mode === InferenceMode.ONLY_ON_DEVICE) throw new VeilError('needs_device_model', 'The on-device model is not responding in this browser.')
  return InferenceMode.ONLY_IN_CLOUD
}

/** Must be called from a user gesture: it may start the Gemini Nano download. */
export async function warmDeviceModel(onProgress: (p: number) => void) {
  await readerModel(InferenceMode.PREFER_ON_DEVICE).initializeDeviceModel(onProgress)
}

// ---------- errors ----------

export class VeilError extends Error {
  code: 'not_configured' | 'needs_device_model' | 'offline' | 'bad_output' | 'failed'
  constructor(code: VeilError['code'], message: string) {
    super(message)
    this.code = code
  }
}

function wrap(e: unknown, strictDevice: boolean): VeilError {
  if (e instanceof VeilError) return e
  const msg = e instanceof Error ? e.message : String(e)
  if (strictDevice) return new VeilError('needs_device_model', msg)
  if (!navigator.onLine) return new VeilError('offline', msg)
  return new VeilError('failed', msg)
}

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const s = cleaned.indexOf('{')
    const e = cleaned.lastIndexOf('}')
    if (s >= 0 && e > s) return JSON.parse(cleaned.slice(s, e + 1)) as T
    throw new VeilError('bad_output', 'The model returned something Veil could not read. Try again.')
  }
}

const fileToPart = (file: File): Promise<Part> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error)
    r.onloadend = () =>
      resolve({ type: 'inlineData', inlineData: { data: String(r.result).split(',')[1], mimeType: file.type || 'image/png' } } as Part)
    r.readAsDataURL(file)
  })

const src = (s: unknown): Source => (s === 'on_device' ? 'on_device' : 'in_cloud')

// ---------- stage 1: READ ----------

const READ_PROMPT = `You read medical laboratory reports. From the report below, list every test result.
Rules:
- "name" is the test name, "value" the measured result, "unit" the unit, "range" the reference range exactly as printed.
- "flag" is low, normal or high compared with the reference range; unknown if there is no range.
- "panel" is a short name for the group of tests.
- "residualIdentifiers": copy verbatim any person names, addresses, phone numbers, emails, record or ID numbers you can still see. Placeholders in [BRACKETS] are already hidden, do not list them.
- "age" in years (0 if absent) and "sex".
- Never invent results. Skip headers, lab names and notes.`

export async function readReport(opts: {
  text?: string
  image?: File
  privacy: PrivacyMode
  allowCloud: boolean
}): Promise<{ extraction: Extraction; source: Source }> {
  const wanted = readerMode(opts.privacy, opts.allowCloud)
  const strict = wanted === InferenceMode.ONLY_ON_DEVICE
  let mode: InferenceMode = wanted
  const t0 = performance.now()
  const payload = opts.image ? `${READ_PROMPT}\n\n[image: ${opts.image.name}]` : `${READ_PROMPT}\n\nREPORT:\n${opts.text}`
  try {
    mode = effective(wanted)
    const parts: (string | Part)[] = opts.image
      ? [READ_PROMPT, await fileToPart(opts.image)]
      : [`${READ_PROMPT}\n\nREPORT:\n${opts.text}`]
    const result = await readerModel(mode).generateContent(parts)
    const source = src(result.response.inferenceSource)
    const extraction = parseJson<Extraction>(result.response.text())
    extraction.analytes = (extraction.analytes ?? []).filter((a) => a && a.name && a.value)
    extraction.residualIdentifiers = extraction.residualIdentifiers ?? []
    record({
      stage: 'Read the report',
      mode,
      source,
      ms: performance.now() - t0,
      payload,
      hadImage: Boolean(opts.image),
      leftDevice: source === 'in_cloud',
      identityExposed: source === 'in_cloud' && Boolean(opts.image),
    })
    return { extraction, source }
  } catch (e) {
    throw wrap(e, strict)
  }
}

// ---------- stage 2: EXPLAIN ----------

export function explainPrompt(packet: Packet, language: string) {
  return `You are a careful medical explainer. You are given anonymous lab values only: no name, no identity.
Explain them to the person who took the test, in ${language}. Tone: ${remote('explain_tone')}.
Rules:
- Use everyday words. Explain each test in one line, then what this result may mean.
- Do not diagnose and do not prescribe medicine or doses. Say when a doctor should be consulted.
- "urgency": routine if everything is in range or only mildly off, soon if clearly abnormal values need a doctor's review within days, urgent only for values that are commonly treated as critical.
- "items": one entry per analyte, same order, "name" copied exactly. Keep names and units in their original form.
- Write every other field in ${language}.

ANONYMOUS VALUES:
${JSON.stringify(packet)}`
}

export async function explain(
  packet: Packet,
  language: string,
  offline: boolean,
): Promise<{ explanation: Explanation; source: Source }> {
  let mode: InferenceMode = offline ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_IN_CLOUD
  const prompt = explainPrompt(packet, language)
  const t0 = performance.now()
  try {
    mode = effective(mode)
    const result = await explainerModel(mode).generateContent(prompt)
    const source = src(result.response.inferenceSource)
    const explanation = parseJson<Explanation>(result.response.text())
    explanation.items = explanation.items ?? []
    explanation.questions = explanation.questions ?? []
    explanation.habits = explanation.habits ?? []
    record({
      stage: 'Explain the values',
      mode,
      source,
      ms: performance.now() - t0,
      payload: prompt,
      hadImage: false,
      leftDevice: source === 'in_cloud',
      identityExposed: false,
    })
    return { explanation, source }
  } catch (e) {
    throw wrap(e, offline)
  }
}

// ---------- stage 3: ASK ----------

export async function ask(
  question: string,
  packet: Packet,
  explanation: Explanation,
  language: string,
  onChunk: (text: string) => void,
): Promise<Source> {
  const prompt = `You are answering a follow-up question about a lab report. Answer in ${language}, in at most 4 short sentences, plainly. Do not diagnose or prescribe; suggest asking a doctor where it matters.

LAB VALUES: ${JSON.stringify(packet.analytes)}
SUMMARY ALREADY GIVEN: ${explanation.summary}

QUESTION: ${scrubText(question).scrubbed}`
  const t0 = performance.now()
  try {
    const mode = effective(InferenceMode.PREFER_ON_DEVICE)
    const result = await askModel(mode).generateContentStream(prompt)
    let text = ''
    for await (const chunk of result.stream) {
      text += chunk.text()
      onChunk(text)
    }
    const response = await result.response
    const source = src(response.inferenceSource)
    record({
      stage: 'Follow-up question',
      mode,
      source,
      ms: performance.now() - t0,
      payload: prompt,
      hadImage: false,
      leftDevice: source === 'in_cloud',
      identityExposed: false,
    })
    return source
  } catch (e) {
    throw wrap(e, false)
  }
}
