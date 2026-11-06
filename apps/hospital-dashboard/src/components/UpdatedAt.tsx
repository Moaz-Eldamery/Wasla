import RefreshRounded from '@mui/icons-material/RefreshRounded'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { color } from '../theme.ts'
import { formatTime } from '../time.ts'
import { currentLanguage } from '../translations/i18n.ts'

/**
 * When a panel last heard from the server, with a manual refresh. Live
 * updates arrive with KAN-27; until then panels poll and staff can refresh.
 */
export function UpdatedAt({ at, refreshing, onRefresh }: { at: number; refreshing: boolean; onRefresh(): void }) {
  const { t } = useTranslation()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: color.muted }}>
      {at > 0 && (
        <Typography variant="body2" className="tabular" aria-live="polite">
          {t('refresh.updatedAt', { time: formatTime(new Date(at), currentLanguage()) })}
        </Typography>
      )}
      <Tooltip title={t('refresh.refresh')}>
        <IconButton size="small" onClick={onRefresh} aria-label={t('refresh.refresh')} disabled={refreshing}>
          <RefreshRounded
            fontSize="small"
            sx={{
              animation: refreshing ? 'wasla-spin 0.9s linear infinite' : 'none',
              '@keyframes wasla-spin': { to: { transform: 'rotate(360deg)' } },
            }}
          />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
