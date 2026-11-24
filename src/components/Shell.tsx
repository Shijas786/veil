import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'
import type { DeviceState, Source } from '../lib/types'
import { sfx } from '../lib/sound'

export function Backdrop({ stage }: { stage: string }) {
  const cloudy = stage === 'explaining' || stage === 'results'
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -left-[20%] -top-[30%] h-[80vmax] w-[80vmax] rounded-full opacity-40 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #1f8f78 0%, transparent 60%)', animation: 'drift 22s ease-in-out infinite' }}
      />
      <motion.div
        className="absolute -right-[25%] top-[10%] h-[70vmax] w-[70vmax] rounded-full blur-[130px]"
        animate={{ opacity: cloudy ? 0.42 : 0.16 }}
        transition={{ duration: 1.6 }}
        style={{ background: 'radial-gradient(circle, #2a5fb8 0%, transparent 60%)', animation: 'drift 28s ease-in-out infinite reverse' }}
      />
      <svg className="absolute inset-x-0 top-0 h-[70vh] w-full opacity-[0.22]" viewBox="0 0 1200 600" preserveAspectRatio="none">
        {Array.from({ length: 9 }).map((_, i) => (
          <path
            key={i}
            d={`M0 ${120 + i * 38} C 200 ${40 + i * 44}, 400 ${260 + i * 22}, 600 ${150 + i * 36} S 1000 ${60 + i * 46}, 1200 ${170 + i * 34}`}
            fill="none"
            stroke={i % 3 === 0 ? '#7ab8ff' : '#7cf5d0'}
            strokeWidth="1"
            strokeDasharray="6 14"
            style={{ animation: `veil-wave ${50 + i * 9}s linear infinite` }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#07100f_85%)]" />
    </div>
  )
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7cf5d0" />
            <stop offset="1" stopColor="#7ab8ff" />
          </linearGradient>
        </defs>
        <motion.path
          d="M10 18c9 0 14 28 22 28s13-28 22-28"
          fill="none"
          stroke="url(#lg)"
          strokeWidth="6"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: 'easeInOut' }}
        />
        <circle cx="32" cy="46" r="4" fill="#7cf5d0" />
      </svg>
      <span className="font-serif text-[26px] leading-none tracking-tight">veil</span>
    </div>
  )
}

const DEVICE_COPY: Record<DeviceState, { label: string; tone: string }> = {
  ready: { label: 'On-device model ready', tone: 'text-device' },
  downloading: { label: 'Downloading on-device model', tone: 'text-amber' },
  downloadable: { label: 'Enable on-device model', tone: 'text-amber' },
  unavailable: { label: 'No on-device model on this device', tone: 'text-mist' },
  unsupported: { label: 'No on-device model in this browser', tone: 'text-mist' },
}

export function DevicePill({ state, progress, onEnable }: { state: DeviceState; progress: number; onEnable: () => void }) {
  const c = DEVICE_COPY[state]
  const clickable = state === 'downloadable'
  return (
    <button
      onClick={clickable ? onEnable : undefined}
      disabled={!clickable}
      title={
        state === 'ready'
          ? 'Gemini Nano runs inside this browser. Reading your report never needs the network.'
          : 'On-device inference needs Chrome desktop 139+ with Gemini Nano. Veil falls back to the cloud with your consent.'
      }
      className={`glass relative flex items-center gap-2 overflow-hidden rounded-full px-3.5 py-2 text-[12.5px] font-medium ${c.tone} ${clickable ? 'hover:bg-white/10' : '!cursor-default'}`}
    >
      {state === 'downloading' && (
        <motion.span className="absolute inset-y-0 left-0 bg-amber/15" animate={{ width: `${Math.round(progress * 100)}%` }} />
      )}
      <span className={`relative h-2 w-2 rounded-full bg-current ${state === 'ready' || state === 'downloading' ? 'dot-live' : ''}`} />
      <span className="relative hidden sm:inline">
        {c.label}
        {state === 'downloading' && progress > 0 ? ` · ${Math.round(progress * 100)}%` : ''}
      </span>
    </button>
  )
}

export function SourceBadge({ source, small }: { source: Source; small?: boolean }) {
  const map = {
    on_device: { t: 'On-device', c: 'text-device border-device/30 bg-device/10', i: '◉' },
    in_cloud: { t: 'Cloud', c: 'text-cloud border-cloud/30 bg-cloud/10', i: '☁' },
    local_rules: { t: 'Local rules', c: 'text-fog border-white/20 bg-white/5', i: '▣' },
  }[source]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${map.c} ${small ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-1 text-[11.5px]'}`}>
      <span aria-hidden>{map.i}</span>
      {map.t}
    </span>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'cloud'
  disabled?: boolean
  className?: string
}) {
  const styles = {
    primary: 'bg-device text-ink hover:brightness-110 shadow-[0_10px_40px_-10px_#7cf5d0aa]',
    cloud: 'bg-cloud text-ink hover:brightness-110 shadow-[0_10px_40px_-10px_#7ab8ffaa]',
    ghost: 'glass text-fog hover:bg-white/10',
  }[variant]
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={() => {
        sfx.tap()
        onClick?.()
      }}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </motion.button>
  )
}

export function Modal({ open, children, onClose }: { open: boolean; children: ReactNode; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal
            className="glass w-full max-w-lg rounded-3xl bg-ink-2/90 p-7"
            initial={{ y: 30, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Drawer({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 bg-black/65" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.aside
            className="scroll-thin absolute inset-y-0 right-0 w-full max-w-[520px] overflow-y-auto border-l border-white/10 bg-ink-2 p-7"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-serif text-3xl">{title}</h2>
              <button onClick={onClose} className="glass grid h-9 w-9 place-items-center rounded-full text-mist hover:text-fog" aria-label="Close">
                ✕
              </button>
            </div>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const icon = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
export const ShieldIcon = ({ size = 16 }: { size?: number }) => (
  <svg {...icon} width={size} height={size} aria-hidden>
    <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)
export const ClockIcon = () => (
  <svg {...icon} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
export const SoundIcon = ({ on }: { on: boolean }) => (
  <svg {...icon} aria-hidden>
    <path d="M4 10v4h4l5 4V6L8 10H4z" />
    {on ? <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
  </svg>
)
