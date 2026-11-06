import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell.tsx'
import type { StaffRole } from './lib/api.ts'
import { LoginPage } from './LoginPage.tsx'
import { TodayPage } from './pages/receptionist/TodayPage.tsx'
import { homePathFor } from './roles.ts'
import { useSession } from './session.tsx'

/** Shows `children` only to a signed-in staff member with `role`; everyone else goes to login. */
function RequireRole({ role, children }: { role?: StaffRole; children: ReactNode }) {
  const { state } = useSession()
  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'signed-out' || state.user.type !== 'STAFF') return <Navigate to="/login" replace />
  if (role && !state.user.roles.includes(role)) return <Navigate to="/" replace />
  return <>{children}</>
}

/** `/` sends staff to their first role's screen. */
function Home() {
  const { t } = useTranslation()
  const { state } = useSession()
  if (state.status !== 'signed-in') return null
  const path = homePathFor(state.user)
  if (path) return <Navigate to={path} replace />
  return (
    <AppShell>
      <Box sx={{ p: 3, maxWidth: 640 }}>
        <Alert severity="info">{t('shell.noRoleScreens')}</Alert>
      </Box>
    </AppShell>
  )
}

function FullPageSpinner() {
  const { t } = useTranslation()
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} role="status" aria-label={t('shell.loading')}>
      <CircularProgress />
    </Box>
  )
}

export default function App() {
  const { state } = useSession()
  return (
    <Routes>
      <Route
        path="/login"
        element={
          state.status === 'signed-in' && state.user.type === 'STAFF' ? <Navigate to="/" replace /> : <LoginPage />
        }
      />
      <Route
        path="/reception"
        element={
          <RequireRole role="RECEPTIONIST">
            <TodayPage />
          </RequireRole>
        }
      />
      <Route
        path="/"
        element={
          <RequireRole>
            <Home />
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
