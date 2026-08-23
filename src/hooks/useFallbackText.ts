import { useTranslation } from 'react-i18next'
import { isPlaceholder } from '../i18n'

/**
 * READ A STRING, AND FALL BACK RATHER THAN SHOW THE MARKER.
 *
 * CLAUDE.md asks for `TODO_AZ` where the Azerbaijani is not yet a native
 * speaker's, on the argument that a placeholder is better than a machine
 * translation. It is — for the person filling the file in. For the person
 * reading the page it is worse than either, so every panel resolved it the same
 * way: try the active language, treat the marker as absent, fall back to
 * Russian.
 *
 * The same eight lines had been copied into four components, which is fine until
 * one of them is fixed and the others are not. This is those eight lines, once.
 *
 * `list` is the same rule for the array-valued keys (the for/against columns):
 * an array whose every entry is a marker counts as absent, and a partly
 * translated one keeps the entries that are real.
 */
export function useFallbackText(ns: string) {
  const { t, i18n } = useTranslation(ns)

  const text = (key: string, opts?: Record<string, unknown>): string => {
    const v = t(key, { defaultValue: '', ...opts })
    if (typeof v === 'string' && v && !isPlaceholder(v)) return v
    return i18n.getFixedT('ru', ns)(key, { defaultValue: '', ...opts }) as string
  }

  const list = (key: string): string[] => {
    const v = t(key, { returnObjects: true, defaultValue: [] })
    const arr = Array.isArray(v) ? (v as string[]) : []
    if (arr.length > 0 && !arr.every(isPlaceholder)) return arr.filter((x) => !isPlaceholder(x))
    const ru = i18n.getFixedT('ru', ns)(key, { returnObjects: true, defaultValue: [] })
    return Array.isArray(ru) ? (ru as string[]) : []
  }

  return { text, list, language: i18n.language }
}
