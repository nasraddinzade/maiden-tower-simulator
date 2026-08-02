import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import azUi from '../locales/az/ui.json'
import azHypotheses from '../locales/az/hypotheses.json'
import azHotspots from '../locales/az/hotspots.json'
import ruUi from '../locales/ru/ui.json'
import ruHypotheses from '../locales/ru/hypotheses.json'
import ruHotspots from '../locales/ru/hotspots.json'
import enUi from '../locales/en/ui.json'
import enHypotheses from '../locales/en/hypotheses.json'
import enHotspots from '../locales/en/hotspots.json'

export const SUPPORTED_LANGUAGES = ['az', 'ru', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_NAMES: Record<Language, string> = {
  az: 'Azərbaycanca',
  ru: 'Русский',
  en: 'English',
}

const STORAGE_KEY = 'maiden-tower.lang'

/** localStorage → navigator.language → az, per CLAUDE.md. */
export function detectLanguage(): Language {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage?.getItem(STORAGE_KEY)
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as Language
    }
    const nav = window.navigator?.language?.slice(0, 2)
    if (nav && (SUPPORTED_LANGUAGES as readonly string[]).includes(nav)) {
      return nav as Language
    }
  }
  return 'az'
}

export function setLanguage(lang: Language) {
  i18n.changeLanguage(lang)
  try {
    window.localStorage?.setItem(STORAGE_KEY, lang)
  } catch {
    // private mode or storage disabled — the choice just will not persist
  }
}

i18n.use(initReactI18next).init({
  resources: {
    az: { ui: azUi, hypotheses: azHypotheses, hotspots: azHotspots },
    ru: { ui: ruUi, hypotheses: ruHypotheses, hotspots: ruHotspots },
    en: { ui: enUi, hypotheses: enHypotheses, hotspots: enHotspots },
  },
  lng: detectLanguage(),
  // Azerbaijani is the default, but its long-form prose is still TODO_AZ, so it
  // falls back to Russian rather than showing the placeholder to a reader.
  fallbackLng: ['ru', 'en'],
  ns: ['ui', 'hypotheses', 'hotspots'],
  defaultNS: 'ui',
  interpolation: { escapeValue: false },
  returnObjects: true,
})

/**
 * True when a string is still an untranslated placeholder. Used so the UI can
 * fall back rather than showing "TODO_AZ" to a reader — see CLAUDE.md, which
 * asks for a placeholder rather than a bad machine translation.
 */
export function isPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === 'TODO_AZ'
}

export default i18n
