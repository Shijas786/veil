import { describe, expect, it } from 'vitest'
import { SAMPLES } from './samples'
import { ageBand, buildPacket, flagFromRange, rangePosition, readAge, readSex, scrubText } from './scrub'
import type { Analyte } from './types'

const a = (name: string, value: string, range: string, unit = 'g/dL'): Analyte => ({ name, value, unit, range, flag: 'unknown' })

describe('scrubText', () => {
  it.each(SAMPLES.map((s) => [s.id, s.text] as const))('seals every identifier in the %s sample', (_id, text) => {
    const { scrubbed, identifiers } = scrubText(text)
    expect(identifiers.length).toBeGreaterThanOrEqual(4)
    for (const leak of ['Anjali', 'Menon', 'Rahul', 'Verma', 'Whitfield', 'Kurian', 'Priya Nair', 'Alan Brooks', '98470', 'SDL/24', 'CC-00982117', 'NW-4471902', '@', 'Lake View'])
      expect(scrubbed).not.toContain(leak)
  })
  it('keeps the lab values readable', () => {
    const { scrubbed } = scrubText(SAMPLES[0].text)
    expect(scrubbed).toContain('Haemoglobin')
    expect(scrubbed).toContain('9.8')
    expect(scrubbed).toContain('12.0 - 15.5')
  })
  it('does not mistake value ranges for phone numbers', () => {
    const t = 'WBC 7400 /uL 4000-10000\nPlatelets 250000 150000-410000\nRBC 4.52 3.80 - 4.80'
    expect(scrubText(t).scrubbed).toBe(t)
  })
  it('seals what the on-device model finds beyond the rules', () => {
    const { scrubbed, identifiers } = scrubText('Seen with her husband Gopal Krishnan today.\nHb 9 g/dL', ['Gopal Krishnan'])
    expect(scrubbed).not.toContain('Gopal')
    expect(identifiers[0].by).toBe('model')
  })
})

describe('buildPacket', () => {
  it('never forwards an identifier, even if a model put one in a field', () => {
    const ids = [{ kind: 'Name', text: 'Anjali Menon', by: 'rules' as const }]
    const { packet, dropped } = buildPacket('CBC for Anjali Menon', [a('Haemoglobin', '9.8', '12.0 - 15.5'), a('Anjali Menon', '34', ''), a('Contact', 'a@b.example', ''), a('Note: see <script>', '1', '')], ids, 34, 'female')
    const wire = JSON.stringify(packet)
    expect(wire).not.toMatch(/anjali|menon|@|script/i)
    expect(packet.analytes.map((x) => x.name)).toEqual(['Haemoglobin'])
    expect(dropped).toHaveLength(3)
    expect(packet.panel).toBe('Lab panel')
  })
  it('sends an age band, never an exact age', () => {
    const { packet } = buildPacket('CBC', [a('Hb', '13', '12 - 15')], [], 34, 'female')
    expect(packet.ageBand).toBe(ageBand(34))
    expect(JSON.stringify(packet)).not.toContain('34')
  })
})

describe('ranges', () => {
  it('reads age and sex from the report locally', () => {
    expect(readAge(SAMPLES[0].text)).toBe(34)
    expect(readSex(SAMPLES[0].text)).toBe('female')
    expect(readAge(SAMPLES[1].text)).toBe(47)
    expect(readSex(SAMPLES[1].text)).toBe('male')
  })
  it('flags values against their printed range', () => {
    expect(flagFromRange(a('Hb', '9.8', '12.0 - 15.5'))).toBe('low')
    expect(flagFromRange(a('LDL', '158', '< 100'))).toBe('high')
    expect(flagFromRange(a('HDL', '38', '> 40'))).toBe('low')
    expect(flagFromRange(a('TSH', '2.4', '0.4 - 4.0'))).toBe('normal')
    expect(rangePosition(a('X', '5', '0 - 10'))).toBeCloseTo(0.5)
  })
})
