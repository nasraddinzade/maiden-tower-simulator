import { useTranslation } from 'react-i18next'
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, setLanguage, type Language } from '../../i18n'

/**
 * Language switcher. Azerbaijani first because it is the project's default
 * (CLAUDE.md); switching is instant, with no reload.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language as Language

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        top: 12,
        zIndex: 21,
        display: 'flex',
        gap: 3,
        background: 'rgba(12,14,18,.82)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 6,
        padding: 3,
      }}
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = current === lang
        return (
          <button
            key={lang}
            onClick={() => setLanguage(lang)}
            title={LANGUAGE_NAMES[lang]}
            style={{
              font: '11px system-ui, sans-serif',
              color: active ? '#0e1116' : '#cfd8e3',
              background: active ? '#c8d6e5' : 'transparent',
              border: 'none',
              borderRadius: 4,
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            {lang.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
