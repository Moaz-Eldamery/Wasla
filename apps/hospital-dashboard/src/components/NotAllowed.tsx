import BlockRounded from '@mui/icons-material/BlockRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { StaffRole } from '../lib/api.ts'
import { homePathFor } from '../roles.ts'
import { useUser } from '../session.tsx'
import { color } from '../theme.ts'
import { AppShell } from './AppShell.tsx'

/**
 * What a signed-in staff member sees when they open another role's page by
 * URL. It only hides the screen: the server refuses the data anyway (403).
 */
export function NotAllowed({ role }: { role: StaffRole }) {
  const { t } = useTranslation()
  const user = useUser()
  const home = homePathFor(user)
  return (
    <AppShell>
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', px: 2, py: 6 }}>
        <Box sx={{ maxWidth: 480, textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: color.ruleSoft, display: 'grid', placeItems: 'center' }}>
            <BlockRounded sx={{ color: color.muted, fontSize: 28 }} aria-hidden />
          </Box>
          <Typography variant="h1">{t('notAllowed.title')}</Typography>
          <Typography sx={{ color: color.muted }}>{t('notAllowed.body', { role: t(`roles.${role}`) })}</Typography>
          {home && (
            <Button component={Link} to={home} variant="contained" sx={{ mt: 1 }}>
              {t('notAllowed.goHome')}
            </Button>
          )}
        </Box>
      </Box>
    </AppShell>
  )
}
