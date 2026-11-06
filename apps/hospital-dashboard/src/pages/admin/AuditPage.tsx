import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import LockRounded from '@mui/icons-material/LockRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import ListSubheader from '@mui/material/ListSubheader'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchAuditLog, type AuditAction, type AuditEntry, type AuditFilter } from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { cairoDate, formatTime } from '../../time.ts'
import { currentLanguage, errorMessage } from '../../translations/i18n.ts'
import { PageBody, PageHeader } from './AdminLayout.tsx'
import { AUDIT_ACTION_GROUPS } from './audit.ts'

/**
 * The audit log (KAN-20 §6): who did what, to which record, and whether it
 * worked. Read-only: there is nothing here to edit or delete, and entries
 * carry no medical content or passwords.
 */
export function AuditPage() {
  const { t } = useTranslation()
  const [whoInput, setWhoInput] = useState('')
  const [who, setWho] = useState('')
  const [action, setAction] = useState<AuditAction | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setWho(whoInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [whoInput])

  const backwards = Boolean(from && to && from > to)
  const filter: AuditFilter = { who: who || undefined, action: action || undefined, from: from || undefined, to: to || undefined }
  const filtered = Boolean(whoInput || action || from || to)

  const log = useInfiniteQuery({
    queryKey: ['audit-log', filter],
    queryFn: ({ pageParam }) => searchAuditLog(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !backwards,
    placeholderData: keepPreviousData,
  })
  const entries = log.data?.pages.flatMap((p) => p.entries) ?? []

  const clear = () => {
    setWhoInput('')
    setWho('')
    setAction('')
    setFrom('')
    setTo('')
  }

  return (
    <PageBody wide>
      <PageHeader
        title={t('audit.title')}
        intro={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'flex-start', gap: 0.75 }}>
            <LockRounded sx={{ fontSize: 18, mt: '2px', color: color.muted }} aria-hidden />
            {t('audit.intro')}
          </Box>
        }
      />

      <Box role="search" aria-label={t('audit.filters')} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, mb: 2.5 }}>
        <TextField
          size="small"
          value={whoInput}
          onChange={(e) => setWhoInput(e.target.value)}
          label={t('audit.who')}
          placeholder={t('audit.whoPlaceholder')}
          sx={{ width: { xs: '100%', sm: 260 }, bgcolor: color.panel }}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { type: 'search', maxLength: 100 },
            input: { startAdornment: <InputAdornment position="start"><SearchRounded sx={{ color: color.muted }} /></InputAdornment> },
          }}
        />
        <TextField
          select
          size="small"
          label={t('audit.action')}
          value={action}
          onChange={(e) => setAction(e.target.value as AuditAction | '')}
          sx={{ width: { xs: '100%', sm: 240 }, bgcolor: color.panel }}
          slotProps={{ select: { displayEmpty: true, MenuProps: { slotProps: { paper: { sx: { maxHeight: 420 } } } } }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">{t('audit.allActions')}</MenuItem>
          {AUDIT_ACTION_GROUPS.flatMap(({ group, actions }) => [
            <ListSubheader key={group} sx={{ lineHeight: '32px', fontWeight: 600, color: color.muted }}>
              {t(`audit.groups.${group}`)}
            </ListSubheader>,
            ...actions.map((a) => (
              <MenuItem key={a} value={a} sx={{ pl: 3 }}>
                {t(`audit.actions.${a}`)}
              </MenuItem>
            )),
          ])}
        </TextField>
        <TextField type="date" size="small" label={t('audit.from')} value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: to || undefined } }} sx={{ width: 168, bgcolor: color.panel }} />
        <TextField type="date" size="small" label={t('audit.to')} value={to} onChange={(e) => setTo(e.target.value)} error={backwards} helperText={backwards ? t('audit.backwards') : undefined} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || undefined } }} sx={{ width: 168, bgcolor: color.panel }} />
        {filtered && (
          <Button onClick={clear} sx={{ color: color.inkSoft }}>
            {t('audit.clear')}
          </Button>
        )}
      </Box>

      <Paper sx={{ overflow: 'hidden', opacity: log.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms ease-out' }}>
        {backwards ? (
          <Typography sx={{ p: 4, color: color.muted, textAlign: 'center' }}>{t('audit.backwards')}</Typography>
        ) : log.isPending ? (
          <Box sx={{ p: 4, display: 'grid', placeItems: 'center' }} role="status" aria-label={t('shell.loading')}>
            <CircularProgress size={28} />
          </Box>
        ) : log.isError ? (
          <Alert severity="error" sx={{ m: 2 }} action={<Button color="inherit" size="small" onClick={() => void log.refetch()}>{t('common.retry')}</Button>}>
            {t('audit.loadFailed')} {errorMessage(log.error)}
          </Alert>
        ) : entries.length === 0 ? (
          <Typography sx={{ p: 4, color: color.muted, textAlign: 'center' }}>{filtered ? t('audit.noMatch') : t('audit.empty')}</Typography>
        ) : (
          <>
            <Table size="small" aria-label={t('audit.title')} sx={{ '& th': { color: color.muted, fontWeight: 600, fontSize: '0.8125rem', bgcolor: color.brandWash, py: 1.25 }, '& td': { py: 1.25, verticalAlign: 'top' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('audit.col.when')}</TableCell>
                  <TableCell>{t('audit.col.who')}</TableCell>
                  <TableCell>{t('audit.col.action')}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('audit.col.record')}</TableCell>
                  <TableCell>{t('audit.col.outcome')}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{t('audit.col.ip')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 1.5, borderTop: `1px solid ${color.rule}` }}>
              <Typography variant="body2" sx={{ color: color.muted }}>
                {t('audit.shown', { count: entries.length.toLocaleString(currentLanguage() === 'ar' ? 'ar-EG' : 'en-GB') })}
              </Typography>
              {log.hasNextPage ? (
                <Button onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                  {log.isFetchingNextPage ? t('shell.loading') : t('audit.loadOlder')}
                </Button>
              ) : (
                <Typography variant="body2" sx={{ color: color.muted }}>
                  {t('audit.end')}
                </Typography>
              )}
            </Box>
          </>
        )}
      </Paper>
    </PageBody>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const when = new Date(entry.occurredAt)
  const refused = entry.outcome !== 'SUCCESS'
  return (
    <TableRow>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <time dateTime={entry.occurredAt}>
          <Box component="span" sx={{ display: 'block', fontWeight: 500 }}>
            {formatTime(when, lang)}
          </Box>
          <Box component="span" sx={{ display: 'block', color: color.muted, fontSize: '0.8125rem' }}>
            {formatShortDate(cairoDate(when), lang)}
          </Box>
        </time>
      </TableCell>
      <TableCell>
        {entry.actor ? (
          <>
            <Box component="span" sx={{ display: 'block', fontWeight: 500 }}>
              <bdi>{entry.actor.name}</bdi>
            </Box>
            <Box component="span" sx={{ display: 'block', color: color.muted, fontSize: '0.8125rem' }}>
              {t(`audit.actorType.${entry.actor.type}`)}
            </Box>
          </>
        ) : (
          <Box component="span" sx={{ color: color.muted }}>
            {t('audit.noActor')}
          </Box>
        )}
      </TableCell>
      <TableCell>
        {t(`audit.actions.${entry.action}`)}
        {entry.entityType && (
          <Box component="span" sx={{ display: { xs: 'block', md: 'none' }, color: color.muted, fontSize: '0.8125rem' }}>
            {t(`audit.entity.${entry.entityType}`)} {entry.entityId && <ShortId id={entry.entityId} />}
          </Box>
        )}
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
        {entry.entityType ? (
          <>
            {t(`audit.entity.${entry.entityType}`)} {entry.entityId && <ShortId id={entry.entityId} />}
          </>
        ) : (
          <Box component="span" sx={{ color: color.muted }}>
            —
          </Box>
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: refused ? 600 : 400, color: refused ? color.now : color.inkSoft }}>
          {refused && <ErrorOutlineRounded sx={{ fontSize: 16 }} aria-hidden />}
          {t(`audit.outcome.${entry.outcome}`)}
        </Box>
      </TableCell>
      <TableCell className="tabular" sx={{ display: { xs: 'none', lg: 'table-cell' }, color: color.muted, whiteSpace: 'nowrap' }}>
        <span dir="ltr">{entry.ip ?? '—'}</span>
      </TableCell>
    </TableRow>
  )
}

/** The first block of a record's ID: enough to match it up, short enough to scan. The full ID is in the title. */
function ShortId({ id }: { id: string }) {
  return (
    <Box component="span" title={id} dir="ltr" className="tabular" sx={{ color: color.muted, fontSize: '0.8125rem' }}>
      #{id.split('-')[0].slice(0, 8)}
    </Box>
  )
}

function formatShortDate(date: string, lang: 'en' | 'ar'): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`))
}
