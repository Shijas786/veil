import { initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  initializeFirestore,
  limit,
  orderBy,
  persistentLocalCache,
  query,
  type Firestore,
} from 'firebase/firestore'
import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from 'firebase/remote-config'
import type { Packet, SavedReport, Explanation } from './types'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

export let app: FirebaseApp | null = null
let db: Firestore | null = null
let rc: RemoteConfig | null = null
let userPromise: Promise<User | null> | null = null

/** Remote Config lets the cloud model and tone change without shipping a new build. */
const RC_DEFAULTS = {
  cloud_model: 'gemini-3.5-flash-lite',
  explain_tone: 'calm, plain-spoken, never alarmist',
  max_analytes: 40,
}

if (isConfigured) {
  app = initializeApp(firebaseConfig)

  // App Check protects the Firebase AI Logic endpoint. Debug tokens are used on localhost.
  const siteKey = env.VITE_APPCHECK_SITE_KEY
  if (env.DEV || env.VITE_APPCHECK_DEBUG_TOKEN) {
    ;(self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
      env.VITE_APPCHECK_DEBUG_TOKEN || true
  }
  if (siteKey) {
    try {
      initializeAppCheck(app, {
        provider:
          env.VITE_APPCHECK_PROVIDER === 'enterprise'
            ? new ReCaptchaEnterpriseProvider(siteKey)
            : new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      })
    } catch (e) {
      console.warn('App Check init failed', e)
    }
  }

  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache() })
  } catch (e) {
    console.warn('Firestore init failed', e)
  }

  try {
    rc = getRemoteConfig(app)
    rc.settings.minimumFetchIntervalMillis = env.DEV ? 0 : 3_600_000
    rc.defaultConfig = RC_DEFAULTS
    fetchAndActivate(rc).catch(() => {})
  } catch (e) {
    console.warn('Remote Config init failed', e)
  }
}

export function remote<K extends keyof typeof RC_DEFAULTS>(key: K): (typeof RC_DEFAULTS)[K] {
  if (!rc) return RC_DEFAULTS[key]
  const v = getValue(rc, key)
  return (typeof RC_DEFAULTS[key] === 'number' ? v.asNumber() || RC_DEFAULTS[key] : v.asString() || RC_DEFAULTS[key]) as (typeof RC_DEFAULTS)[K]
}

/** Anonymous auth: a private history with no email, no name, no account. */
export function ensureUser(): Promise<User | null> {
  if (!app) return Promise.resolve(null)
  if (!userPromise) {
    const auth = getAuth(app)
    userPromise = new Promise((resolve) => {
      const stop = onAuthStateChanged(auth, (u) => {
        if (u) {
          stop()
          resolve(u)
        }
      })
      signInAnonymously(auth).catch((e) => {
        console.warn('Anonymous sign-in failed', e)
        stop()
        userPromise = null
        resolve(null)
      })
    })
  }
  return userPromise
}

/** Only the anonymous packet and the explanation headline are ever stored. */
export async function saveReport(packet: Packet, explanation: Explanation): Promise<string | null> {
  const user = await ensureUser()
  if (!user || !db) return null
  const ref = await addDoc(collection(db, 'users', user.uid, 'reports'), {
    createdAt: Date.now(),
    panel: packet.panel,
    headline: explanation.headline,
    urgency: explanation.urgency,
    analytes: packet.analytes,
  })
  return ref.id
}

export async function loadReports(): Promise<SavedReport[]> {
  const user = await ensureUser()
  if (!user || !db) return []
  const snap = await getDocs(query(collection(db, 'users', user.uid, 'reports'), orderBy('createdAt', 'desc'), limit(24)))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedReport, 'id'>) }))
}

export async function deleteReport(id: string) {
  const user = await ensureUser()
  if (!user || !db) return
  await deleteDoc(doc(db, 'users', user.uid, 'reports', id))
}
