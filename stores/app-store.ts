import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserPreferences {
  theme: 'system' | 'light' | 'dark'
  defaultDays: number
  groupSize: number
  budget: 'low' | 'medium' | 'high'
  language: string
}

interface AppState {
  preferences: UserPreferences
  setTheme: (theme: UserPreferences['theme']) => void
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void
  getPreferencesSummary: () => string
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  defaultDays: 3,
  groupSize: 2,
  budget: 'medium',
  language: '中文',
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      preferences: DEFAULT_PREFERENCES,

      setTheme: (theme) =>
        set((state) => ({
          preferences: { ...state.preferences, theme },
        })),

      setPreference: (key, value) =>
        set((state) => ({
          preferences: { ...state.preferences, [key]: value },
        })),

      getPreferencesSummary: () => {
        const { defaultDays, groupSize, budget, language } = get().preferences
        const budgetMap = { low: '经济型', medium: '中等', high: '高端' }
        return `${defaultDays}天行程, ${groupSize}人, ${budgetMap[budget]}预算, ${language}`
      },
    }),
    {
      name: 'smart-itinerary-preferences',
    },
  ),
)
