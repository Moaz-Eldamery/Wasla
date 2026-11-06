import AddRounded from '@mui/icons-material/AddRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import DomainAddRounded from '@mui/icons-material/DomainAddRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded'
import PlaceRounded from '@mui/icons-material/PlaceRounded'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import {
  assignClinicStaff,
  createClinic,
  createDepartment,
  listAdminDepartments,
  listStaff,
  renameDepartment,
  setClinicActive,
  setDepartmentActive,
  unassignClinicStaff,
  updateClinic,
  type AdminClinic,
  type AdminDepartment,
  type AssignedStaff,
  type ClinicRequest,
  type DepartmentKind,
  type LocalizedText,
  type StaffMember,
} from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { currentLanguage, errorMessage, localized } from '../../translations/i18n.ts'
import { PageBody, PageHeader } from './AdminLayout.tsx'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { RoleTags } from './StaffPage.tsx'
import { ALL_ROLES, CLINIC_ROLES, staffKeys } from './staff.ts'

const DEPARTMENTS_KEY = ['admin-departments'] as const
const KINDS: DepartmentKind[] = ['CLINICAL', 'LAB', 'RADIOLOGY']

type Confirm =
  | { kind: 'department'; department: AdminDepartment }
  | { kind: 'clinic'; clinic: AdminClinic; departmentActive: boolean }
  | { kind: 'unassign'; clinic: AdminClinic; person: AssignedStaff }

type Editing =
  | { kind: 'new-department' }
  | { kind: 'rename-department'; department: AdminDepartment }
  | { kind: 'new-clinic'; department: AdminDepartment }
  | { kind: 'edit-clinic'; clinic: AdminClinic }
  | { kind: 'assign'; clinic: AdminClinic }

/**
 * Departments, clinics and who works in them (KAN-20 §4). Pick a department
 * on the start side; its clinics, their location and their staff fill the rest.
 */
export function HospitalPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const departments = useQuery({ queryKey: DEPARTMENTS_KEY, queryFn: listAdminDepartments })
  const refresh = () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY })

  const list = departments.data ?? []
  const selected = list.find((d) => d.id === params.get('department')) ?? list[0]
  const select = (id: string) => setParams({ department: id }, { replace: true })

  return (
    <PageBody wide>
      <PageHeader
        title={t('hospital.title')}
        intro={t('hospital.intro')}
        actions={
          <Button variant="contained" startIcon={<DomainAddRounded />} onClick={() => setEditing({ kind: 'new-department' })}>
            {t('hospital.addDepartment')}
          </Button>
        }
      />

      {departments.isPending ? (
        <Box sx={{ p: 4, display: 'grid', placeItems: 'center' }} role="status" aria-label={t('shell.loading')}>
          <CircularProgress size={28} />
        </Box>
      ) : departments.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void departments.refetch()}>{t('common.retry')}</Button>}>
          {t('hospital.loadFailed')} {errorMessage(departments.error)}
        </Alert>
      ) : list.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: color.muted }}>{t('hospital.noDepartments')}</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '210px minmax(0, 1fr)', lg: '260px minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
          <Paper component="nav" aria-label={t('hospital.departments')} sx={{ p: 1, position: { sm: 'sticky' }, top: { sm: 88 } }}>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}>
              {list.map((d) => {
                const current = d.id === selected?.id
                return (
                  <li key={d.id}>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => select(d.id)}
                      aria-current={current ? 'true' : undefined}
                      sx={{
                        all: 'unset',
                        boxSizing: 'border-box',
                        width: '100%',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 0.25,
                        px: 1.5,
                        py: 1.1,
                        borderRadius: '8px',
                        textAlign: 'start',
                        bgcolor: current ? color.brandTint : 'transparent',
                        '&:hover': { bgcolor: current ? color.brandTint : color.brandWash },
                        '&:focus-visible': { outline: `2px solid ${color.brand}`, outlineOffset: '-2px' },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Typography component="span" sx={{ fontWeight: 600, color: current ? color.brandDeep : d.active ? color.ink : color.muted, flex: 1, minWidth: 0 }}>
                          {localized(d.name, lang)}
                        </Typography>
                        {!d.active && <InactiveTag />}
                      </Box>
                      <Typography component="span" variant="body2" sx={{ color: color.muted }}>
                        {t(`departmentKind.${d.kind}`)} · {t('hospital.clinicCount', { count: d.clinics.length.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB') })}
                      </Typography>
                    </Box>
                  </li>
                )
              })}
            </Box>
          </Paper>

          {selected && (
            <DepartmentPanel
              department={selected}
              onRename={() => setEditing({ kind: 'rename-department', department: selected })}
              onToggle={() => setConfirm({ kind: 'department', department: selected })}
              onAddClinic={() => setEditing({ kind: 'new-clinic', department: selected })}
              onEditClinic={(clinic) => setEditing({ kind: 'edit-clinic', clinic })}
              onToggleClinic={(clinic) => setConfirm({ kind: 'clinic', clinic, departmentActive: selected.active })}
              onAssign={(clinic) => setEditing({ kind: 'assign', clinic })}
              onUnassign={(clinic, person) => setConfirm({ kind: 'unassign', clinic, person })}
            />
          )}
        </Box>
      )}

      {(editing?.kind === 'new-department' || editing?.kind === 'rename-department') && (
        <DepartmentDialog
          department={editing.kind === 'rename-department' ? editing.department : undefined}
          onClose={() => setEditing(null)}
          onSaved={async (d) => {
            await refresh()
            select(d.id)
          }}
        />
      )}
      {(editing?.kind === 'new-clinic' || editing?.kind === 'edit-clinic') && (
        <ClinicDialog
          departmentId={editing.kind === 'new-clinic' ? editing.department.id : editing.clinic.departmentId}
          clinic={editing.kind === 'edit-clinic' ? editing.clinic : undefined}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {editing?.kind === 'assign' && <AssignDialog clinic={editing.clinic} onClose={() => setEditing(null)} onSaved={refresh} />}

      <ConfirmDialog
        open={confirm !== null}
        danger={confirm?.kind === 'unassign' || (confirm?.kind === 'department' && confirm.department.active) || (confirm?.kind === 'clinic' && confirm.clinic.active)}
        {...confirmCopy(confirm, t, lang)}
        onConfirm={async () => {
          if (!confirm) return
          if (confirm.kind === 'department') await setDepartmentActive(confirm.department.id, !confirm.department.active)
          else if (confirm.kind === 'clinic') await setClinicActive(confirm.clinic.id, !confirm.clinic.active)
          else await unassignClinicStaff(confirm.clinic.id, confirm.person.id)
          await refresh()
        }}
        onClose={() => setConfirm(null)}
      />
    </PageBody>
  )
}

/** Title, body and button text for each confirmation, all saying what happens to booking. */
function confirmCopy(confirm: Confirm | null, t: TFunction, lang: 'en' | 'ar') {
  if (!confirm) return { title: '', body: '', confirmLabel: '' }
  if (confirm.kind === 'unassign') {
    const vars = { name: confirm.person.name, clinic: localized(confirm.clinic.name, lang) }
    return { title: t('hospital.unassign.title', vars), body: t('hospital.unassign.body', vars), confirmLabel: t('hospital.unassign.confirm') }
  }
  if (confirm.kind === 'department') {
    const d = confirm.department
    const vars = { name: localized(d.name, lang) }
    return d.active
      ? { title: t('hospital.deactivateDepartment.title', vars), body: <><strong>{t('hospital.deactivateDepartment.body', vars)}</strong><span>{t('hospital.keepsPast')}</span></>, confirmLabel: t('hospital.deactivate') }
      : { title: t('hospital.reactivateDepartment.title', vars), body: t('hospital.reactivateDepartment.body'), confirmLabel: t('hospital.reactivate') }
  }
  const c = confirm.clinic
  const vars = { name: localized(c.name, lang) }
  return c.active
    ? { title: t('hospital.deactivateClinic.title', vars), body: <><strong>{t('hospital.deactivateClinic.body')}</strong><span>{t('hospital.keepsPast')}</span></>, confirmLabel: t('hospital.deactivate') }
    : { title: t('hospital.reactivateClinic.title', vars), body: confirm.departmentActive ? t('hospital.reactivateClinic.body') : t('hospital.reactivateClinic.departmentInactive'), confirmLabel: t('hospital.reactivate') }
}

function InactiveTag() {
  const { t } = useTranslation()
  return (
    <Box component="span" sx={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 600, px: 0.75, py: 0.125, borderRadius: '6px', bgcolor: color.ruleSoft, color: '#475569' }}>
      {t('hospital.inactive')}
    </Box>
  )
}

function DepartmentPanel({
  department,
  onRename,
  onToggle,
  onAddClinic,
  onEditClinic,
  onToggleClinic,
  onAssign,
  onUnassign,
}: {
  department: AdminDepartment
  onRename(): void
  onToggle(): void
  onAddClinic(): void
  onEditClinic(clinic: AdminClinic): void
  onToggleClinic(clinic: AdminClinic): void
  onAssign(clinic: AdminClinic): void
  onUnassign(clinic: AdminClinic, person: AssignedStaff): void
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const other = lang === 'ar' ? 'en' : 'ar'
  return (
    <Paper component="section" aria-labelledby="department-name" sx={{ overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 2, md: 3 }, pt: 2.5, pb: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { sm: 'flex-start' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography id="department-name" variant="h2" component="h2">
              {localized(department.name, lang)}
            </Typography>
            {!department.active && <InactiveTag />}
          </Box>
          <Typography variant="body2" sx={{ color: color.muted, mt: 0.5 }}>
            <span lang={other} dir={other === 'ar' ? 'rtl' : 'ltr'}>{localized(department.name, other)}</span> · {t(`departmentKind.${department.kind}`)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <Button startIcon={<EditRounded />} onClick={onRename}>
            {t('hospital.rename')}
          </Button>
          <Button color={department.active ? 'error' : 'primary'} onClick={onToggle}>
            {department.active ? t('hospital.deactivate') : t('hospital.reactivate')}
          </Button>
        </Box>
      </Box>

      {!department.active && (
        <Alert severity="info" sx={{ mx: { xs: 2, md: 3 }, mb: 2 }}>
          {t('hospital.departmentInactiveNote')}
        </Alert>
      )}

      <Box sx={{ px: { xs: 2, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, borderTop: `1px solid ${color.rule}`, bgcolor: color.brandWash }}>
        <Typography variant="h3" component="h3" sx={{ color: color.inkSoft, textTransform: 'uppercase', flex: 1 }}>
          {t('hospital.clinics')}
        </Typography>
        <Button size="small" startIcon={<AddRounded />} onClick={onAddClinic}>
          {t('hospital.addClinic')}
        </Button>
      </Box>

      {department.clinics.length === 0 ? (
        <Typography sx={{ px: { xs: 2, md: 3 }, py: 3, color: color.muted, borderTop: `1px solid ${color.rule}` }}>{t('hospital.noClinics')}</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {department.clinics.map((clinic) => (
            <ClinicRow
              key={clinic.id}
              clinic={clinic}
              departmentActive={department.active}
              onEdit={() => onEditClinic(clinic)}
              onToggle={() => onToggleClinic(clinic)}
              onAssign={() => onAssign(clinic)}
              onUnassign={(person) => onUnassign(clinic, person)}
            />
          ))}
        </Box>
      )}
    </Paper>
  )
}

function ClinicRow({
  clinic,
  departmentActive,
  onEdit,
  onToggle,
  onAssign,
  onUnassign,
}: {
  clinic: AdminClinic
  departmentActive: boolean
  onEdit(): void
  onToggle(): void
  onAssign(): void
  onUnassign(person: AssignedStaff): void
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const name = localized(clinic.name, lang)
  const bookable = clinic.active && departmentActive
  return (
    <Box component="li" aria-label={name} sx={{ px: { xs: 2, md: 3 }, py: 2.25, borderTop: `1px solid ${color.rule}`, display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'flex-start' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography component="h4" sx={{ fontWeight: 600, fontSize: '1rem', color: clinic.active ? color.ink : color.muted }}>
              {name}
            </Typography>
            {!clinic.active && <InactiveTag />}
            {clinic.active && !departmentActive && (
              <Typography component="span" variant="body2" sx={{ color: color.muted }}>
                {t('hospital.notBookableDepartment')}
              </Typography>
            )}
          </Box>
          <Typography variant="body2" sx={{ color: color.inkSoft, mt: 0.5, display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <PlaceRounded sx={{ fontSize: 16, mt: '2px', color: color.muted }} aria-hidden />
            <span>
              {t('queue.location', { building: clinic.building, floor: clinic.floor })} · {localized(clinic.directions, lang)}
            </span>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
          <Button size="small" startIcon={<EditRounded />} onClick={onEdit} aria-label={t('hospital.editClinicNamed', { name })}>
            {t('hospital.edit')}
          </Button>
          <Button size="small" color={clinic.active ? 'error' : 'primary'} onClick={onToggle} aria-label={t(clinic.active ? 'hospital.deactivateNamed' : 'hospital.reactivateNamed', { name })}>
            {clinic.active ? t('hospital.deactivate') : t('hospital.reactivate')}
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Typography variant="body2" sx={{ color: color.muted, width: { sm: 120 }, flexShrink: 0, pt: 0.75 }}>
          {t('hospital.staffInClinic')}
        </Typography>
        <Box component="ul" aria-label={t('hospital.staffOf', { name })} sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75, flex: 1 }}>
          {clinic.staff.map((person) => (
            <Box
              component="li"
              key={person.id}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                pl: 1.25,
                pr: 0.25,
                py: 0.25,
                borderRadius: '8px',
                border: `1px solid ${color.rule}`,
                bgcolor: color.panel,
                color: person.active ? color.ink : color.muted,
                fontSize: '0.875rem',
              }}
            >
              <bdi>{person.name}</bdi>
              <Typography component="span" variant="body2" sx={{ color: color.muted }}>
                {ALL_ROLES.filter((r) => person.roles.includes(r) && r !== 'ADMIN').map((r) => t(`staffRoles.${r}`)).join(', ')}
                {!person.active && ` · ${t('hospital.inactive')}`}
              </Typography>
              <Tooltip title={t('hospital.unassign.label', { name: person.name })}>
                <IconButton size="small" onClick={() => onUnassign(person)} aria-label={t('hospital.unassign.label', { name: person.name })} sx={{ color: color.muted }}>
                  <CloseRounded sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
          <li>
            <Button size="small" variant="outlined" startIcon={<PersonAddAlt1Rounded />} onClick={onAssign} aria-label={t('hospital.assignTo', { name })} sx={{ borderColor: color.rule }}>
              {t('hospital.assign')}
            </Button>
          </li>
        </Box>
      </Box>
      {bookable && clinic.staff.filter((p) => p.active && p.roles.includes('DOCTOR')).length === 0 && (
        <Typography variant="body2" sx={{ color: color.consult }}>
          {t('hospital.noDoctors')}
        </Typography>
      )}
    </Box>
  )
}

/** An English and an Arabic field side by side, each typed in its own direction. */
function BilingualFields({ label, value, onChange, tried, multiline }: { label: string; value: LocalizedText; onChange(v: LocalizedText): void; tried: boolean; multiline?: boolean }) {
  const { t } = useTranslation()
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
      {(['en', 'ar'] as const).map((side) => {
        const missing = tried && !value[side].trim()
        return (
          <TextField
            key={side}
            label={`${label} (${t(`hospital.form.in.${side}`)})`}
            value={value[side]}
            onChange={(e) => onChange({ ...value, [side]: e.target.value })}
            error={missing}
            helperText={missing ? t('hospital.form.required') : undefined}
            required
            multiline={multiline}
            minRows={multiline ? 2 : undefined}
            slotProps={{ htmlInput: { dir: side === 'ar' ? 'rtl' : 'ltr', lang: side, maxLength: 200 } }}
          />
        )
      })}
    </Box>
  )
}

function useSave<T>(save: () => Promise<T>, onDone: (result: T) => Promise<unknown> | void, onClose: () => void) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    setPending(true)
    setError(null)
    try {
      const result = await save()
      await onDone(result)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setPending(false)
    }
  }
  return { pending, error, run }
}

function DepartmentDialog({ department, onClose, onSaved }: { department?: AdminDepartment; onClose(): void; onSaved(d: AdminDepartment): Promise<unknown> }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<DepartmentKind>(department?.kind ?? 'CLINICAL')
  const [name, setName] = useState<LocalizedText>(department?.name ?? { en: '', ar: '' })
  const [tried, setTried] = useState(false)
  const clean = { en: name.en.trim(), ar: name.ar.trim() }
  const { pending, error, run } = useSave(
    () => (department ? renameDepartment(department.id, clean) : createDepartment({ kind, name: clean })),
    onSaved,
    onClose,
  )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (clean.en && clean.ar) void run()
  }
  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="department-title">
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle id="department-title" sx={{ fontWeight: 600 }}>
          {department ? t('hospital.form.renameDepartment') : t('hospital.form.newDepartment')}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          {department ? (
            <Typography variant="body2" sx={{ color: color.muted }}>
              {t('hospital.form.kindFixed', { kind: t(`departmentKind.${department.kind}`) })}
            </Typography>
          ) : (
            <TextField select label={t('hospital.form.kind')} value={kind} onChange={(e) => setKind(e.target.value as DepartmentKind)} helperText={t('hospital.form.kindHint')}>
              {KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {t(`departmentKind.${k}`)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <BilingualFields label={t('hospital.form.name')} value={name} onChange={setName} tried={tried} />
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={onClose} disabled={pending} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? t('common.saving') : department ? t('common.save') : t('hospital.form.createDepartment')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

function ClinicDialog({ departmentId, clinic, onClose, onSaved }: { departmentId: string; clinic?: AdminClinic; onClose(): void; onSaved(): Promise<unknown> }) {
  const { t } = useTranslation()
  const [name, setName] = useState<LocalizedText>(clinic?.name ?? { en: '', ar: '' })
  const [building, setBuilding] = useState(clinic?.building ?? '')
  const [floor, setFloor] = useState(clinic?.floor ?? '')
  const [directions, setDirections] = useState<LocalizedText>(clinic?.directions ?? { en: '', ar: '' })
  const [tried, setTried] = useState(false)
  const body: ClinicRequest = {
    name: { en: name.en.trim(), ar: name.ar.trim() },
    building: building.trim(),
    floor: floor.trim(),
    directions: { en: directions.en.trim(), ar: directions.ar.trim() },
  }
  const complete = body.name.en && body.name.ar && body.building && body.floor && body.directions.en && body.directions.ar
  const { pending, error, run } = useSave(() => (clinic ? updateClinic(clinic.id, body) : createClinic(departmentId, body)), onSaved, onClose)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (complete) void run()
  }
  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="clinic-title">
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle id="clinic-title" sx={{ fontWeight: 600 }}>
          {clinic ? t('hospital.form.editClinic') : t('hospital.form.newClinic')}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2.5, pt: '8px !important' }}>
          <BilingualFields label={t('hospital.form.name')} value={name} onChange={setName} tried={tried} />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField label={t('hospital.form.building')} value={building} onChange={(e) => setBuilding(e.target.value)} required error={tried && !body.building} helperText={tried && !body.building ? t('hospital.form.required') : undefined} slotProps={{ htmlInput: { maxLength: 40 } }} />
            <TextField label={t('hospital.form.floor')} value={floor} onChange={(e) => setFloor(e.target.value)} required error={tried && !body.floor} helperText={tried && !body.floor ? t('hospital.form.required') : undefined} slotProps={{ htmlInput: { maxLength: 40 } }} />
          </Box>
          <BilingualFields label={t('hospital.form.directions')} value={directions} onChange={setDirections} tried={tried} multiline />
          {clinic && (
            <Typography variant="body2" sx={{ color: color.muted }}>
              {t('hospital.form.editNote')}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={onClose} disabled={pending} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? t('common.saving') : clinic ? t('common.save') : t('hospital.form.createClinic')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

function AssignDialog({ clinic, onClose, onSaved }: { clinic: AdminClinic; onClose(): void; onSaved(): Promise<unknown> }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [person, setPerson] = useState<StaffMember | null>(null)
  const staff = useQuery({ queryKey: staffKeys.list('', 'active'), queryFn: () => listStaff({ status: 'active' }) })
  const assigned = new Set(clinic.staff.map((p) => p.id))
  const options = (staff.data ?? []).filter((p) => p.roles.some((r) => CLINIC_ROLES.includes(r)) && !assigned.has(p.id))
  const { pending, error, run } = useSave(() => assignClinicStaff(clinic.id, person!.id), onSaved, onClose)
  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="assign-title">
      <Box
        component="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (person) void run()
        }}
      >
        <DialogTitle id="assign-title" sx={{ fontWeight: 600 }}>
          {t('hospital.assignTitle', { name: localized(clinic.name, lang) })}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          <Autocomplete
            options={options}
            value={person}
            onChange={(_, v) => setPerson(v)}
            loading={staff.isPending}
            getOptionLabel={(p) => p.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText={staff.isError ? t('staff.loadFailed') : t('hospital.noOneToAssign')}
            renderOption={({ key, ...props }, p) => (
              <Box component="li" key={key} {...props} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <bdi>{p.name}</bdi>
                <RoleTags roles={p.roles} />
              </Box>
            )}
            renderInput={(params) => <TextField {...params} label={t('hospital.pickStaff')} autoFocus />}
          />
          <Typography variant="body2" sx={{ color: color.muted }}>
            {t('hospital.assignNote')}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={onClose} disabled={pending} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !person}>
            {pending ? t('common.saving') : t('hospital.assign')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
