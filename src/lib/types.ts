export type Flag = 'low' | 'normal' | 'high' | 'unknown'

export interface Analyte {
  name: string
  value: string
  unit: string
  range: string
  flag: Flag
}

export interface Identifier {
  kind: string
  text: string
  by: 'rules' | 'model'
}

export interface Extraction {
  panel: string
  analytes: Analyte[]
  residualIdentifiers: string[]
  age?: number
  sex?: string
}

/** The only thing that is ever allowed to cross to the cloud. */
export interface Packet {
  panel: string
  ageBand: string
  sex: string
  analytes: Analyte[]
}

export interface ExplainedItem {
  name: string
  status: 'low' | 'normal' | 'high' | 'unknown'
  meaning: string
  note: string
}

export interface Explanation {
  headline: string
  summary: string
  urgency: 'routine' | 'soon' | 'urgent'
  items: ExplainedItem[]
  questions: string[]
  habits: string[]
}

export type Source = 'on_device' | 'in_cloud' | 'local_rules'

export interface LedgerEntry {
  id: string
  at: number
  stage: string
  mode: string
  source: Source
  ms: number
  /** Exactly what was handed to the model. */
  payload: string
  hadImage: boolean
  leftDevice: boolean
  identityExposed: boolean
}

export type PrivacyMode = 'strict' | 'hybrid'
export type DeviceState = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'ready'

export interface ReportInput {
  kind: 'text' | 'image'
  text?: string
  file?: File
  previewUrl?: string
  label: string
}

export interface SavedReport {
  id: string
  createdAt: number
  panel: string
  headline: string
  urgency: Explanation['urgency']
  analytes: Analyte[]
}
