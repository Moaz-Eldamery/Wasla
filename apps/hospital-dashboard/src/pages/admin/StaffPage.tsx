import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import DoNotDisturbOnRounded from '@mui/icons-material/DoNotDisturbOnRounded'
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import FormHelperText from '@mui/material/FormHelperText'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ApiError,
  createStaff,
  listStaff,
  setStaffActive,
  setStaffRoles,
  type NewStaffResponse,
  type StaffMember,
  type StaffRole,
} from '../../lib/api.ts'
import { useUser } from '../../session.tsx'
import { color } from '../../theme.ts'
import { errorMessage } from '../../translations/i18n.ts'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { PageBody, PageHeader } from './AdminLayout.tsx'
import { ALL_ROLES, isEmail, normalizePhone, staffKeys } from './staff.ts'

type StatusFilter = 'all' | 'active' | 'inactive'

/**
 * Staff and roles (KAN-20 §3): find anyone by name, work email or phone, add
 * staff with a one-time password, change roles, and deactivate or reactivate
 * accounts. Staff log in with their work email; the phone is optional.
 */
export function StaffPage() {
  const { t } = useTranslation()
  const me = useUser()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [adding, setAdding] = useState(false)
  const [editingRoles, setEditingRoles] = useState<StaffMember | null>(null)
  const [toggling, setToggling] = useState<StaffMember | null>(null)

  // Ask the server once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const staff = useQuery({
    queryKey: staffKeys.list(q, status),
    queryFn: () => listStaff({ q, status: status === 'all' ? undefined : status }),
    placeholderData: keepPreviousData,
  })

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: staffKeys.all }), queryClient.invalidateQueries({ queryKey: ['admin-departments'] })])

  return (
    <PageBody>
      <PageHeader
        title={t('staff.title')}
        intro={t('staff.intro')}
        actions={
          <Button variant="contained" startIcon={<PersonAddAlt1Rounded />} onClick={() => setAdding(true)}>
            {t('staff.add')}
          </Button>
        }
      />

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'center' }, mb: 2 }}>
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('staff.searchPlaceholder')}
          size="small"
          sx={{ width: { md: 340 }, bgcolor: color.panel }}
          slotProps={{
            htmlInput: { 'aria-label': t('staff.search'), type: 'search' },
            input: { startAdornment: <InputAdornment position="start"><SearchRounded sx={{ color: color.muted }} /></InputAdornment> },
          }}
        />
        <Tabs value={status} onChange={(_, v: StatusFilter) => setStatus(v)} aria-label={t('staff.statusFilter')} sx={{ minHeight: 40, '.MuiTab-root': { minHeight: 40, px: 2 } }}>
          <Tab value="all" label={t('staff.filter.all')} />
          <Tab value="active" label={t('staff.filter.active')} />
          <Tab value="inactive" label={t('staff.filter.inactive')} />
        </Tabs>
      </Box>

      <Paper sx={{ overflow: 'hidden', opacity: staff.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms ease-out' }}>
        {staff.isPending ? (
          <Box sx={{ p: 4, display: 'grid', placeItems: 'center' }} role="status" aria-label={t('shell.loading')}>
            <CircularProgress size={28} />
          </Box>
        ) : staff.isError ? (
          <Alert severity="error" sx={{ m: 2 }} action={<Button color="inherit" size="small" onClick={() => void staff.refetch()}>{t('common.retry')}</Button>}>
            {t('staff.loadFailed')} {errorMessage(staff.error)}
          </Alert>
        ) : staff.data.length === 0 ? (
          <Typography sx={{ p: 4, color: color.muted, textAlign: 'center' }}>{q ? t('staff.noMatch', { q }) : t('staff.empty')}</Typography>
        ) : (
          <Table aria-label={t('staff.title')} sx={{ '& th': { color: color.muted, fontWeight: 600, fontSize: '0.8125rem', bgcolor: color.brandWash, py: 1.25 }, '& td': { py: 1.25 } }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('staff.col.name')}</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('staff.col.email')}</TableCell>
                <TableCell>{t('staff.col.roles')}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('staff.col.status')}</TableCell>
                <TableCell align="right">
                  <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    {t('staff.col.actions')}
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {staff.data.map((person) => (
                <StaffRow
                  key={person.id}
                  person={person}
                  isMe={person.id === me.id}
                  onRoles={() => setEditingRoles(person)}
                  onToggle={() => setToggling(person)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {adding && <AddStaffDialog onClose={() => setAdding(false)} onCreated={refresh} />}
      {editingRoles && (
        <RolesDialog person={editingRoles} isMe={editingRoles.id === me.id} onClose={() => setEditingRoles(null)} onSaved={refresh} />
      )}
      <ConfirmDialog
        open={toggling !== null}
        danger={toggling?.active}
        title={toggling ? t(toggling.active ? 'staff.deactivate.title' : 'staff.reactivate.title', { name: toggling.name }) : ''}
        body={
          toggling?.active ? (
            <>
              <strong>{t('staff.deactivate.loggedOut')}</strong>
              <span>{t('staff.deactivate.body')}</span>
            </>
          ) : (
            t('staff.reactivate.body')
          )
        }
        confirmLabel={toggling?.active ? t('staff.deactivate.confirm') : t('staff.reactivate.confirm')}
        onConfirm={async () => {
          await setStaffActive(toggling!.id, !toggling!.active)
          await refresh()
        }}
        onClose={() => setToggling(null)}
      />
    </PageBody>
  )
}

function StaffRow({ person, isMe, onRoles, onToggle }: { person: StaffMember; isMe: boolean; onRoles(): void; onToggle(): void }) {
  const { t } = useTranslation()
  const inactive = !person.active
  return (
    <TableRow sx={{ '& td': { color: inactive ? color.muted : color.ink } }}>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography component="span" sx={{ fontWeight: 600, color: 'inherit' }}>
            <bdi>{person.name}</bdi>
          </Typography>
          {isMe && (
            <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, px: 0.75, py: 0.125, borderRadius: '6px', bgcolor: color.brandTint, color: color.brandDeep }}>
              {t('staff.you')}
            </Box>
          )}
        </Box>
        <Typography variant="body2" dir="ltr" sx={{ color: color.muted, display: { md: 'none' }, textAlign: 'start', overflowWrap: 'anywhere' }}>
          {person.email}
        </Typography>
        <Box sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.25 }}>
          <StatusText active={person.active} />
        </Box>
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
        <Box component="span" dir="ltr" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
          {person.email}
        </Box>
        {person.phone && (
          <Typography variant="body2" className="tabular" dir="ltr" sx={{ color: color.muted, textAlign: 'start' }}>
            {person.phone}
          </Typography>
        )}
      </TableCell>
      <TableCell>
        <RoleTags roles={person.roles} />
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
        <StatusText active={person.active} />
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <Box sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button size="small" onClick={onRoles} aria-label={t('staff.rolesFor', { name: person.name })}>
            {t('staff.changeRoles')}
          </Button>
          <Tooltip title={isMe && person.active ? t('staff.cantDeactivateSelf') : ''}>
            <span>
              <Button
                size="small"
                color={person.active ? 'error' : 'primary'}
                onClick={onToggle}
                disabled={isMe && person.active}
                sx={{ minWidth: 104 }}
                aria-label={t(person.active ? 'staff.deactivateFor' : 'staff.reactivateFor', { name: person.name })}
              >
                {person.active ? t('staff.deactivate.confirm') : t('staff.reactivate.confirm')}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </TableCell>
    </TableRow>
  )
}

function StatusText({ active }: { active: boolean }) {
  const { t } = useTranslation()
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.875rem', fontWeight: 500, color: active ? color.inkSoft : color.muted }}>
      {active ? <CheckCircleRounded sx={{ fontSize: 16, color: color.brand }} aria-hidden /> : <DoNotDisturbOnRounded sx={{ fontSize: 16 }} aria-hidden />}
      {active ? t('staff.active') : t('staff.inactive')}
    </Box>
  )
}

/** A staff member's roles as quiet tags, in the fixed role order. */
export function RoleTags({ roles }: { roles: StaffRole[] }) {
  const { t } = useTranslation()
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {ALL_ROLES.filter((r) => roles.includes(r)).map((role) => (
        <Box
          component="li"
          key={role}
          sx={{ fontSize: '0.8125rem', fontWeight: 500, px: 1, py: 0.25, borderRadius: '6px', bgcolor: color.ruleSoft, color: color.inkSoft, whiteSpace: 'nowrap' }}
        >
          {t(`staffRoles.${role}`)}
        </Box>
      ))}
    </Box>
  )
}

function RoleChecks({ value, onChange, lockAdmin, error }: { value: StaffRole[]; onChange(roles: StaffRole[]): void; lockAdmin?: boolean; error?: string }) {
  const { t } = useTranslation()
  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
      <Typography component="legend" sx={{ fontWeight: 600, mb: 0.5 }}>
        {t('staff.form.roles')}
      </Typography>
      <FormGroup>
        {ALL_ROLES.map((role) => {
          const locked = lockAdmin && role === 'ADMIN'
          return (
            <FormControlLabel
              key={role}
              control={
                <Checkbox
                  checked={value.includes(role)}
                  disabled={locked}
                  onChange={(e) => onChange(e.target.checked ? [...value, role] : value.filter((r) => r !== role))}
                />
              }
              label={
                <span>
                  {t(`staffRoles.${role}`)}
                  <Typography component="span" variant="body2" sx={{ color: color.muted, display: 'block' }}>
                    {locked ? t('staff.form.cantDropOwnAdmin') : t(`staffRoleHints.${role}`)}
                  </Typography>
                </span>
              }
              sx={{ alignItems: 'flex-start', mb: 0.75, '.MuiCheckbox-root': { pt: 0.5 } }}
            />
          )
        })}
      </FormGroup>
      {error && <FormHelperText error>{error}</FormHelperText>}
    </Box>
  )
}

function AddStaffDialog({ onClose, onCreated }: { onClose(): void; onCreated(): Promise<unknown> }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [tried, setTried] = useState(false)
  const [pending, setPending] = useState(false)
  const [taken, setTaken] = useState<'email' | 'phone' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<NewStaffResponse | null>(null)

  const cleanEmail = email.trim().toLowerCase()
  const emailOk = isEmail(cleanEmail)
  // The phone is optional for staff: only a filled-in number has to be valid.
  const normalized = phone.trim() ? normalizePhone(phone) : null
  const phoneOk = !phone.trim() || normalized !== null
  const nameError = tried && name.trim().length < 2 ? t('staff.form.nameRequired') : undefined
  const emailError = taken === 'email' ? t('errors.EMAIL_TAKEN') : tried && !emailOk ? t('staff.form.emailInvalid') : undefined
  const phoneError = taken === 'phone' ? t('errors.PHONE_TAKEN') : tried && !phoneOk ? t('staff.form.phoneInvalid') : undefined
  const rolesError = tried && roles.length === 0 ? t('staff.form.rolesRequired') : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (name.trim().length < 2 || !emailOk || !phoneOk || roles.length === 0) return
    setPending(true)
    setError(null)
    try {
      const result = await createStaff({ name: name.trim(), email: cleanEmail, ...(normalized && { phone: normalized }), roles })
      setCreated(result)
      void onCreated()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setTaken('email')
      else if (err instanceof ApiError && err.code === 'PHONE_TAKEN') setTaken('phone')
      else setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  if (created) return <PasswordOnce created={created} onClose={onClose} />

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="add-staff-title">
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle id="add-staff-title" sx={{ fontWeight: 600 }}>
          {t('staff.form.addTitle')}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <TextField label={t('staff.form.name')} value={name} onChange={(e) => setName(e.target.value)} error={!!nameError} helperText={nameError} autoFocus required slotProps={{ htmlInput: { maxLength: 100 } }} />
          <TextField
            label={t('staff.form.email')}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (taken === 'email') setTaken(null)
            }}
            error={!!emailError}
            helperText={emailError ?? t('staff.form.emailHint')}
            required
            slotProps={{ htmlInput: { dir: 'ltr', autoComplete: 'off', maxLength: 254 } }}
          />
          <TextField
            label={t('staff.form.phone')}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              if (taken === 'phone') setTaken(null)
            }}
            error={!!phoneError}
            helperText={phoneError ?? t('staff.form.phoneHint')}
            slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'tel', autoComplete: 'off' } }}
          />
          <RoleChecks value={roles} onChange={setRoles} error={rolesError} />
          <Typography variant="body2" sx={{ color: color.muted }}>
            {t('staff.form.passwordNote')}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={onClose} disabled={pending} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? t('common.saving') : t('staff.form.create')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

/** The temporary password, shown this once. Closing the dialog is the only way out, and it's gone after. */
function PasswordOnce({ created, onClose }: { created: NewStaffResponse; onClose(): void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.temporaryPassword)
      setCopied(true)
    } catch {
      // Clipboard blocked: the password is still on screen to read out or write down.
    }
  }
  return (
    <Dialog open maxWidth="sm" fullWidth aria-labelledby="created-title">
      <DialogTitle id="created-title" sx={{ fontWeight: 600 }}>
        {t('staff.created.title', { name: created.staff.name })}
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography sx={{ color: color.inkSoft }}>{t('staff.created.body')}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, borderRadius: '12px', bgcolor: color.brandWash, border: `1px solid ${color.brandTint}` }}>
          <Typography
            aria-label={t('staff.created.password')}
            dir="ltr"
            sx={{ flex: 1, fontFamily: '"Cascadia Mono", Consolas, "SFMono-Regular", monospace', fontSize: '1.375rem', fontWeight: 600, letterSpacing: '0.02em', color: color.ink, userSelect: 'all', overflowWrap: 'anywhere' }}
          >
            {created.temporaryPassword}
          </Typography>
          <Button startIcon={copied ? <CheckCircleRounded /> : <ContentCopyRounded />} onClick={() => void copy()} sx={{ flexShrink: 0 }}>
            {copied ? t('staff.created.copied') : t('staff.created.copy')}
          </Button>
        </Box>
        <Alert severity="warning">{t('staff.created.once')}</Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="contained" onClick={onClose}>
          {t('staff.created.done')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function RolesDialog({ person, isMe, onClose, onSaved }: { person: StaffMember; isMe: boolean; onClose(): void; onSaved(): Promise<unknown> }) {
  const { t } = useTranslation()
  const [roles, setRoles] = useState<StaffRole[]>(person.roles)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unchanged = roles.length === person.roles.length && roles.every((r) => person.roles.includes(r))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (roles.length === 0 || unchanged) return
    setPending(true)
    setError(null)
    try {
      await setStaffRoles(person.id, ALL_ROLES.filter((r) => roles.includes(r)))
      await onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="roles-title">
      <Box component="form" onSubmit={save}>
        <DialogTitle id="roles-title" sx={{ fontWeight: 600 }}>
          {t('staff.form.rolesTitle', { name: person.name })}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          <RoleChecks value={roles} onChange={setRoles} lockAdmin={isMe} error={roles.length === 0 ? t('staff.form.rolesRequired') : undefined} />
          <Typography variant="body2" sx={{ color: color.muted }}>
            {t('staff.form.rolesNote')}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={onClose} disabled={pending} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || roles.length === 0 || unchanged}>
            {pending ? t('common.saving') : t('staff.form.saveRoles')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
