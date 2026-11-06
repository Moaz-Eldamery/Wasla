import UploadFileRounded from '@mui/icons-material/UploadFileRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { RESULT_FILE_TYPES } from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { checkResultFile, formatBytes } from './resultFile.ts'

interface ResultUploadProps {
  patientName: string
  testName: string
  sending: boolean
  onSend(file: File): void
}

/** Pick, check, then send: nothing leaves the browser until "Send to doctor" (agreed for KAN-19). */
export function ResultUpload({ patientName, testName, sending, onSend }: ResultUploadProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const preview = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const choose = (picked: File | undefined) => {
    if (!picked) return
    const issue = checkResultFile(picked)
    if (issue) {
      setFile(null)
      setProblem(t(issue, { file: picked.name, size: formatBytes(picked.size) }))
      return
    }
    setProblem(null)
    setFile(picked)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    choose(e.dataTransfer.files[0])
  }

  if (file) {
    return (
      <Box sx={{ display: 'grid', gap: 1.75 }}>
        <Box sx={{ border: `1px solid ${color.rule}`, borderRadius: '10px', p: 2, display: 'grid', gridTemplateColumns: preview ? '96px 1fr' : '1fr', gap: 2, alignItems: 'center' }}>
          {preview && (
            <Box component="img" src={preview} alt="" sx={{ width: 96, height: 96, objectFit: 'cover', borderRadius: '8px', border: `1px solid ${color.rule}` }} />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: color.waiting, fontWeight: 600 }}>{t('lab.chosen')}</Typography>
            <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{file.name}</Typography>
            <Typography variant="body2" className="tabular" sx={{ color: color.muted }}>
              {formatBytes(file.size)} · {file.type.replace('application/', '').replace('image/', '').toUpperCase()}
            </Typography>
          </Box>
        </Box>
        <Alert severity="warning" variant="outlined">{t('lab.checkPatient', { name: patientName, test: testName })}</Alert>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="contained" size="large" disabled={sending} onClick={() => onSend(file)}>
            {sending ? t('lab.sending') : t('lab.send')}
          </Button>
          <Button disabled={sending} onClick={() => setFile(null)}>{t('lab.remove')}</Button>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="dropzone"
        sx={{
          border: `2px dashed ${dragging ? color.brand : '#B8C4D3'}`,
          bgcolor: dragging ? color.brandWash : color.ground,
          borderRadius: '12px',
          px: 3,
          py: 4,
          display: 'grid',
          justifyItems: 'center',
          gap: 1,
          textAlign: 'center',
          transition: 'border-color 120ms ease-out, background-color 120ms ease-out',
        }}
      >
        <UploadFileRounded sx={{ fontSize: 36, color: color.brand }} />
        <Typography>
          {t('lab.dropHere')}{' '}
          <Box component="label" htmlFor={inputId} sx={{ color: color.brand, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
            {t('lab.choose')}
          </Box>
        </Typography>
        <Typography variant="body2" sx={{ color: color.muted }}>{t('lab.fileRules')}</Typography>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={RESULT_FILE_TYPES.join(',')}
          hidden
          onChange={(e) => {
            choose(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </Box>
      {problem && <Alert severity="error">{problem}</Alert>}
    </Box>
  )
}
