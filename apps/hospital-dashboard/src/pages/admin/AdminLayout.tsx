import ApartmentRounded from '@mui/icons-material/ApartmentRounded'
import BadgeRounded from '@mui/icons-material/BadgeRounded'
import ForumRounded from '@mui/icons-material/ForumRounded'
import InsightsRounded from '@mui/icons-material/InsightsRounded'
import ManageSearchRounded from '@mui/icons-material/ManageSearchRounded'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { AppShell } from '../../components/AppShell.tsx'
import { color } from '../../theme.ts'

/** The admin's sections, in rail order. Statistics is where /admin lands. */
const ADMIN_SECTIONS = [
  { path: 'statistics', icon: InsightsRounded },
  { path: 'assistant', icon: ForumRounded },
  { path: 'staff', icon: BadgeRounded },
  { path: 'hospital', icon: ApartmentRounded },
  { path: 'audit', icon: ManageSearchRounded },
] as const

/**
 * The frame around every admin section: the shared top bar, then a rail of
 * the five sections on the start side (a strip of tabs on a phone).
 */
export function AdminLayout() {
  const { t } = useTranslation()
  return (
    <AppShell>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, minHeight: 0 }}>
        <Box
          component="nav"
          aria-label={t('admin.nav')}
          sx={{
            flexShrink: 0,
            bgcolor: color.panel,
            borderBottom: { xs: `1px solid ${color.rule}`, sm: 0 },
            borderInlineEnd: { sm: `1px solid ${color.rule}` },
            width: { sm: 92, md: 236 },
            position: { sm: 'sticky' },
            top: { sm: 64 },
            alignSelf: { sm: 'flex-start' },
            height: { sm: 'calc(100vh - 64px)' },
            overflowX: { xs: 'auto', sm: 'visible' },
          }}
        >
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              m: 0,
              p: { xs: 1, md: 1.5 },
              display: 'flex',
              flexDirection: { xs: 'row', sm: 'column' },
              gap: 0.5,
              minWidth: { xs: 'max-content', sm: 0 },
            }}
          >
            {ADMIN_SECTIONS.map(({ path, icon: Icon }) => (
              <li key={path}>
                <Box
                  component={NavLink}
                  to={`/admin/${path}`}
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'row', sm: 'column', md: 'row' },
                    alignItems: 'center',
                    gap: { xs: 1, sm: 0.5, md: 1.5 },
                    px: { xs: 1.5, sm: 0.5, md: 1.5 },
                    py: { xs: 1, sm: 1.25, md: 1.1 },
                    borderRadius: '10px',
                    color: color.inkSoft,
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: { xs: '0.875rem', sm: '0.75rem', md: '0.9375rem' },
                    textAlign: 'center',
                    lineHeight: 1.25,
                    whiteSpace: { xs: 'nowrap', sm: 'normal', md: 'nowrap' },
                    transition: 'background-color 120ms ease-out, color 120ms ease-out',
                    '& svg': { fontSize: { xs: 20, sm: 24, md: 22 }, color: color.muted },
                    '&:hover': { bgcolor: color.brandWash, color: color.ink },
                    '&.active': { bgcolor: color.brandTint, color: color.brandDeep, fontWeight: 600, '& svg': { color: color.brand } },
                  }}
                >
                  <Icon aria-hidden />
                  <span>{t(`admin.sections.${path}`)}</span>
                </Box>
              </li>
            ))}
          </Box>
        </Box>
        <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </Box>
      </Box>
    </AppShell>
  )
}

/** The title block every admin section opens with; actions sit at the end of the line. */
export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'flex-start' },
        gap: { xs: 1.5, sm: 2 },
        mb: 3,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h1">{title}</Typography>
        {intro && <Typography sx={{ color: color.muted, mt: 0.75, maxWidth: '72ch' }}>{intro}</Typography>}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  )
}

/** The padded column a section's content sits in. */
export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <Box sx={{ width: '100%', maxWidth: wide ? 1280 : 1080, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 3, md: 4 }, pb: 6 }}>{children}</Box>
}
