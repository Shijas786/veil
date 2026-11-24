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

  it('keeps compact decimal ranges and typographic range symbols', () => {
    expect(scrubText('TSH 6.2 mIU/L 3.5-10.5').scrubbed).toContain('3.5-10.5')
    const a = { name: 'LDL', value: '90', unit: 'mg/dL', range: '≤ 100', flag: 'normal' as const }
    const b = { name: 'WBC', value: '7400', unit: '/µL', range: '4000 – 10000', flag: 'normal' as const }
    expect(buildPacket('Lipids', [a, b], []).packet.analytes).toHaveLength(2)
  })

  it('drops a packet field that carries a phone number or a date', () => {
    const a = { name: 'Hb', value: '98470 12345', unit: 'g/dL', range: '12-15', flag: 'normal' as const }
    const b = { name: 'RBC', value: '4.1', unit: '12/03/2026', range: '3.8-4.8', flag: 'normal' as const }
    expect(buildPacket('CBC', [a, b], []).packet.analytes).toHaveLength(0)
  })

  it('seals names written in other scripts', () => {
    expect(scrubText('Patient Name: अनन्या नायर\nHb 9.8').scrubbed).not.toContain('अनन्या')
  })

  it('treats strict cutoffs, decimal commas and infant ages correctly', () => {
    const f = (value: string, range: string) => flagFromRange({ name: 'x', value, unit: '', range, flag: 'unknown' })
    expect(f('100', '< 100')).toBe('high')
    expect(f('100', '<= 100')).toBe('normal')
    expect(f('40', '> 40')).toBe('low')
    expect(f('4,8', '4 - 5')).toBe('normal')
    expect(f('7,400', '4,000 - 10,000')).toBe('normal')
    expect(ageBand(readAge('Age: 14 days'))).toBe('infant')
    expect(ageBand(readAge('Age: 8 months'))).toBe('infant')
  })

  it('seals hyphenated mobiles and mixed-separator dates, and reads Indian digit grouping', () => {
    const out = scrubText('Mob 98470-12345\nDOB: 12/03-1990\nPlatelets 95,000 1,50,000 - 4,50,000').scrubbed
    expect(out).not.toContain('98470')
    expect(out).not.toContain('1990')
    expect(out).toContain('1,50,000 - 4,50,000')
    expect(scrubText('Call 98470-12345').scrubbed).not.toContain('98470')
    expect(flagFromRange({ name: 'Platelets', value: '95,000', unit: '/µL', range: '1,50,000 - 4,50,000', flag: 'unknown' })).toBe('low')
    expect(readAge('Age: 34  Mobile: 98470 12345')).toBe(34)
  })

  it('reads million-scale counts, wrapped infant ages and small-to-large ranges', () => {
    expect(flagFromRange({ name: 'Platelets', value: '1,200,000', unit: '/µL', range: '150,000 – 450,000', flag: 'unknown' })).toBe('high')
    expect(ageBand(readAge('Age: 8\nmonths'))).toBe('infant')
    expect(scrubText('PSA 1.2 ng/mL 0.0-2000').scrubbed).toContain('0.0-2000')
    expect(scrubText('DOB: 5/3-1990').scrubbed).not.toContain('1990')
  })
})
