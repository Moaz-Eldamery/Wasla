import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessage } from '../../translations/i18n.ts'

/**
 * Asks before a change that affects other people (deactivating, reactivating).
 * Stays open with the error if the server refuses, and closes once it's done.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm(): Promise<unknown>
  onClose(): void
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (pending) return
    setError(null)
    onClose()
  }

  const confirm = async () => {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
      setPending(false)
      onClose()
    } catch (e) {
      setPending(false)
      setError(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth aria-labelledby="confirm-title">
      <DialogTitle id="confirm-title" sx={{ fontWeight: 600 }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <Typography component="div" sx={{ color: 'text.secondary', display: 'grid', gap: 1 }}>
          {body}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={close} disabled={pending} color="inherit">
          {t('common.cancel')}
        </Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} onClick={() => void confirm()} disabled={pending}>
          {pending ? t('common.saving') : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
