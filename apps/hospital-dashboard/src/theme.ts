import { createTheme } from '@mui/material/styles'
import type { AppointmentStatus, TestStatus } from './lib/api.ts'

/**
 * Wasla's palette, shared with the patient app: deep blue on cool slate.
 * Status colours carry the visit flow and appear nowhere else.
 */
export const color = {
  brand: '#0B5CAB',
  brandDeep: '#084785',
  brandTint: '#E3EEF9',
  brandWash: '#F1F6FC',
  ground: '#F4F7FB',
  panel: '#FFFFFF',
  rule: '#E2E8F0',
  ruleSoft: '#EEF2F7',
  ink: '#0F172A',
  inkSoft: '#334155',
  muted: '#5A6878',
  now: '#B42318',
  nowTint: '#FDECEC',
  waiting: '#027A48',
  waitingTint: '#E5F5EC',
  consult: '#8A5300',
  consultTint: '#FFF1D6',
  consultEdge: '#F0B23E',
} as const

/** Chip colours per appointment status (text on tint, 4.5:1 or better). */
export const statusTone: Record<AppointmentStatus | 'LATE', { fg: string; bg: string }> = {
  BOOKED: { fg: color.brand, bg: color.brandTint },
  CHECKED_IN: { fg: color.waiting, bg: color.waitingTint },
  IN_CONSULTATION: { fg: color.consult, bg: color.consultTint },
  COMPLETED: { fg: '#475569', bg: color.ruleSoft },
  CANCELLED: { fg: '#475569', bg: color.ruleSoft },
  NO_SHOW: { fg: '#475569', bg: color.ruleSoft },
  LATE: { fg: color.now, bg: color.nowTint },
}

/** Chip colours per test status: amber marks the one that needs the doctor. */
export const testTone: Record<TestStatus, { fg: string; bg: string }> = {
  REQUESTED: { fg: '#475569', bg: color.ruleSoft },
  IN_PROGRESS: { fg: color.brand, bg: color.brandTint },
  AWAITING_REVIEW: { fg: color.consult, bg: color.consultTint },
  RELEASED: { fg: color.waiting, bg: color.waitingTint },
}

export const FONT_FAMILY = '"Readex Pro Variable", "Readex Pro", "Segoe UI", system-ui, sans-serif'

export function buildTheme(direction: 'ltr' | 'rtl') {
  return createTheme({
    direction,
    palette: {
      primary: { main: color.brand, dark: color.brandDeep, light: color.brandTint, contrastText: '#FFFFFF' },
      error: { main: color.now },
      success: { main: color.waiting },
      warning: { main: color.consult },
      background: { default: color.ground, paper: color.panel },
      text: { primary: color.ink, secondary: color.muted },
      divider: color.rule,
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: FONT_FAMILY,
      fontSize: 15,
      h1: { fontSize: '1.625rem', fontWeight: 600, letterSpacing: '-0.01em' },
      h2: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.005em' },
      h3: { fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.04em' },
      body1: { fontSize: '0.9375rem' },
      body2: { fontSize: '0.875rem' },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 8, minHeight: 40, paddingInline: 18 } },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { border: `1px solid ${color.rule}` } },
      },
      MuiAppBar: {
        styleOverrides: { root: { border: 0 } },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600, borderRadius: 999 } },
      },
      MuiTooltip: {
        styleOverrides: { tooltip: { fontSize: '0.8125rem', backgroundColor: color.ink } },
      },
    },
  })
}
