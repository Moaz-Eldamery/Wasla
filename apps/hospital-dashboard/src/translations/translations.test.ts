import { afterEach, describe, expect, it } from 'vitest'
import ar from './ar.json'
import en from './en.json'
import { setLanguage } from './i18n.ts'

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

afterEach(async () => {
  await setLanguage('en')
})

describe('translations', () => {
  it('has every key in both Arabic and English', () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort())
  })

  it('has no empty strings', () => {
    for (const file of [en, ar]) {
      for (const key of keys(file)) {
        const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], file)
        expect(value, key).not.toBe('')
      }
    }
  })

  it('switches the whole page to right-to-left for Arabic and remembers it', async () => {
    await setLanguage('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    expect(localStorage.getItem('wasla.language')).toBe('ar')

    await setLanguage('en')
    expect(document.documentElement.dir).toBe('ltr')
  })
})
