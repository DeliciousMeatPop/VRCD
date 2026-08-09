import React, { ReactNode, useState, useEffect, useCallback, useMemo } from 'react'
import { LanguageContext } from './LanguageContext'
import { Language, TranslationKey, getTranslations } from '../i18n/translations'

interface LanguageProviderProps {
  children: ReactNode
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    // Load language from settings on startup
    window.api.settings
      .getLanguage()
      .then((lang) => {
        if (lang === 'en' || lang === 'es') {
          setLanguageState(lang)
        }
      })
      .catch(() => {
        // Fallback: try to detect from locale
        window.api.app
          .getLocale()
          .then((locale) => {
            if (locale.toLowerCase().startsWith('es')) {
              setLanguageState('es')
            }
          })
          .catch(() => {})
      })
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    window.api.settings.setLanguage(lang).catch(console.error)
  }, [])

  const t = useCallback(
    (key: TranslationKey): string => {
      const dict = getTranslations(language)
      return dict[key] as string
    },
    [language]
  )

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
