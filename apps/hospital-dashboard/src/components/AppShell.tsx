import AccountCircleRounded from '@mui/icons-material/AccountCircleRounded'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import TranslateRounded from '@mui/icons-material/TranslateRounded'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { ROLE_PATHS } from '../roles.ts'
import { useSession, useUser } from '../session.tsx'
import { useNow } from '../useNow.ts'
import { color } from '../theme.ts'
import { formatDay } from '../time.ts'
import { currentLanguage, setLanguage } from '../translations/i18n.ts'

/**
 * The frame around every staff screen: the blue top bar with the clinic and
 * day the screen is about, the language switch and the account menu.
 */
export function AppShell({ controls, children }: { controls?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const user = useUser()
  const { logout } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const now = useNow()

  const roleScreens = user.roles.filter((role) => ROLE_PATHS[role])

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" sx={{ bgcolor: color.brand }}>
        <Toolbar sx={{ gap: { xs: 1, md: 3 }, minHeight: { xs: 60, md: 64 }, px: { xs: 1.5, sm: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25 }}>
            <Typography component="span" sx={{ fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {t('app.name')}
            </Typography>
            <Typography component="span" variant="body2" sx={{ color: '#CFE0F3', display: { xs: 'none', sm: 'inline' } }}>
              {t('app.staffSite')}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>{controls}</Box>
          <Typography variant="body2" sx={{ color: '#E3EEF9', display: { xs: 'none', lg: 'block' } }}>
            {formatDay(now, lang)}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            color="inherit"
            startIcon={<TranslateRounded />}
            sx={{ px: { xs: 1, md: 2 }, minWidth: 0, gap: { xs: 0, sm: 1 }, '.MuiButton-startIcon': { m: 0 } }}
            onClick={() => void setLanguage(lang === 'en' ? 'ar' : 'en')}
            aria-label={t('language.switchLabel')}
            lang={lang === 'en' ? 'ar' : 'en'}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              {t('language.switchTo')}
            </Box>
          </Button>
          <Button
            color="inherit"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={menuAnchor ? 'true' : undefined}
            aria-label={t('shell.account')}
            startIcon={<AccountCircleRounded />}
            sx={{
              bgcolor: 'rgba(255,255,255,0.12)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
              minWidth: 0,
              px: { xs: 1.25, md: 2 },
              gap: { xs: 0, md: 1 },
              '.MuiButton-startIcon': { m: 0 },
            }}
          >
            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
              {user.name}
            </Box>
          </Button>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: lang === 'ar' ? 'left' : 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: lang === 'ar' ? 'left' : 'right' }}
            slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }}
          >
            <Box sx={{ px: 2, py: 1.25 }}>
              <Typography variant="body2" sx={{ color: color.muted }}>
                {t('shell.signedInAs')}
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>{user.name}</Typography>
            </Box>
            {roleScreens.length > 1 && <Divider />}
            {roleScreens.length > 1 &&
              roleScreens.map((role) => (
                <MenuItem
                  key={role}
                  selected={location.pathname.startsWith(ROLE_PATHS[role]!)}
                  onClick={() => {
                    setMenuAnchor(null)
                    void navigate(ROLE_PATHS[role]!)
                  }}
                >
                  {t(`roles.${role}`)}
                </MenuItem>
              ))}
            <Divider />
            <MenuItem
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true)
                try {
                  await logout()
                } finally {
                  setLoggingOut(false)
                  setMenuAnchor(null)
                }
              }}
            >
              <ListItemIcon>
                <LogoutRounded fontSize="small" />
              </ListItemIcon>
              {loggingOut ? t('shell.loggingOut') : t('shell.logout')}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  )
}
