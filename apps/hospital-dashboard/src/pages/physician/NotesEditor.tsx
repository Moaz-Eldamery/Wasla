import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, getVisitNotes, saveVisitNotes, type VisitNotes } from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { formatTime } from '../../time.ts'
import { currentLanguage, errorMessage } from '../../translations/i18n.ts'

interface Draft {
  clinicalNotes: string
  patientSummary: string
  baseVersion: number
}

/**
 * Unsaved notes survive a reload in this tab only (sessionStorage), so
 * clinical text never stays behind on a shared computer.
 */
const draftKey = (appointmentId: string) => `wasla.notes-draft.${appointmentId}`
function readDraft(appointmentId: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(appointmentId))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
function writeDraft(appointmentId: string, draft: Draft | null): void {
  try {
    if (draft) sessionStorage.setItem(draftKey(appointmentId), JSON.stringify(draft))
    else sessionStorage.removeItem(draftKey(appointmentId))
  } catch {
    // Without storage the draft lasts until the page reloads.
  }
}

/** Visit notes with explicit saves; every save is a new version (business.md). */
export function NotesEditor({ appointmentId, onToast }: { appointmentId: string; onToast(message: string, error?: boolean): void }) {
  const { t } = useTranslation()
  const notes = useQuery({ queryKey: ['notes', appointmentId], queryFn: () => getVisitNotes(appointmentId) })
  if (notes.isPending) {
    return (
      <Box sx={{ display: 'grid', gap: 2 }} aria-busy>
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={96} />
      </Box>
    )
  }
  if (notes.isError) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={() => void notes.refetch()}>{t('common.retry')}</Button>}>
        {t('notes.loadFailed')} {errorMessage(notes.error)}
      </Alert>
    )
  }
  return <NotesForm appointmentId={appointmentId} latest={notes.data} onToast={onToast} />
}

function NotesForm({ appointmentId, latest, onToast }: { appointmentId: string; latest: VisitNotes | null; onToast(message: string, error?: boolean): void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // Start from this tab's unsaved draft if there is one, else from the saved version.
  const [restored, setRestored] = useState(() => readDraft(appointmentId) !== null)
  const [draft, setDraft] = useState<Draft>(
    () =>
      readDraft(appointmentId) ?? {
        clinicalNotes: latest?.clinicalNotes ?? '',
        patientSummary: latest?.patientSummary ?? '',
        baseVersion: latest?.version ?? 0,
      },
  )
  const [conflict, setConflict] = useState<VisitNotes | null>(null)

  const dirty =
    draft.clinicalNotes !== (latest?.clinicalNotes ?? '') || draft.patientSummary !== (latest?.patientSummary ?? '')

  // Warn before the tab closes with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveVisitNotes(appointmentId, {
        baseVersion: d.baseVersion,
        clinicalNotes: d.clinicalNotes,
        patientSummary: d.patientSummary.trim() ? d.patientSummary : null,
      }),
    onSuccess: (saved) => {
      writeDraft(appointmentId, null)
      queryClient.setQueryData(['notes', appointmentId], saved)
      setDraft({ clinicalNotes: saved.clinicalNotes, patientSummary: saved.patientSummary ?? '', baseVersion: saved.version })
      setConflict(null)
      setRestored(false)
      onToast(t('notes.saved', { version: saved.version }))
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        const newer = await getVisitNotes(appointmentId)
        setConflict(newer)
        // Keep the doctor's text; the next save builds on the version just loaded.
        if (newer) setDraft((d) => ({ ...d, baseVersion: newer.version }))
        return
      }
      onToast(errorMessage(error), true)
    },
  })

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch }
      writeDraft(appointmentId, next)
      return next
    })

  const lang = currentLanguage()
  const shownVersion = conflict ?? latest
  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); save.mutate(draft) }} sx={{ display: 'grid', gap: 2.25 }}>
      {restored && <Alert severity="info">{t('notes.draftRestored')}</Alert>}
      {conflict && (
        <Alert severity="warning">
          {t('notes.conflict')}
          <Box component="details" sx={{ mt: 1 }}>
            <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600 }}>{t('notes.theirVersion')}</Box>
            <Box component="pre" dir="auto" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0, mt: 1 }}>
              {conflict.clinicalNotes}
            </Box>
          </Box>
        </Alert>
      )}
      <TextField
        label={t('notes.clinical')}
        helperText={t('notes.clinicalHelp')}
        value={draft.clinicalNotes}
        onChange={(e) => update({ clinicalNotes: e.target.value })}
        multiline
        minRows={6}
        slotProps={{ htmlInput: { dir: 'auto' } }}
      />
      <TextField
        label={t('notes.summary')}
        helperText={t('notes.summaryHelp')}
        value={draft.patientSummary}
        onChange={(e) => update({ patientSummary: e.target.value })}
        multiline
        minRows={3}
        slotProps={{ htmlInput: { dir: 'auto' } }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Button type="submit" variant="contained" disabled={!dirty || save.isPending}>
          {save.isPending ? t('notes.saving') : t('notes.save')}
        </Button>
        <Typography variant="body2" className="tabular" sx={{ color: dirty ? color.consult : color.muted, fontWeight: dirty ? 600 : 400 }}>
          {dirty
            ? t('notes.unsaved')
            : shownVersion
              ? t('notes.version', { version: shownVersion.version, time: formatTime(shownVersion.createdAt, lang), name: shownVersion.authorName })
              : t('notes.notSaved')}
        </Typography>
      </Box>
    </Box>
  )
}
