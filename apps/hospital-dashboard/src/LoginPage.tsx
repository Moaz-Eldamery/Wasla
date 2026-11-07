import TranslateRounded from '@mui/icons-material/TranslateRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import doctorPhoto from './assets/login-doctor.webp'
import { homePathFor } from './roles.ts'
import { useSession } from './session.tsx'
import { color } from './theme.ts'
import { currentLanguage, errorMessage, setLanguage } from './translations/i18n.ts'

/**
 * Staff log in with the work email and password an admin gave them. Only
 * staff accounts can log in here; patients use the app with their phone.
 */
export function LoginPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const { login } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const user = await login({ email: email.trim(), password })
      void navigate(homePathFor(user) ?? '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,5fr) minmax(0,6fr)' } }}>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          isolation: 'isolate',
          bgcolor: color.brand,
          color: '#FFFFFF',
          px: { xs: 3, md: 7 },
          py: { xs: 4, md: 7 },
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          // The photo, softly blurred, under a Wasla-blue wash that deepens toward the text.
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            zIndex: -1,
            background: `linear-gradient(180deg, rgba(11,92,171,0.68) 0%, rgba(11,92,171,0.6) 40%, rgba(8,71,133,0.94) 78%, ${color.brandDeep} 100%)`,
          },
        }}
      >
        <Box
          component="img"
          src={doctorPhoto}
          alt=""
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: -2,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '38% 35%',
            filter: 'blur(3px) saturate(0.9)',
            transform: 'scale(1.06)',
          }}
        />
        <Typography component="span" sx={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.015em' }}>
          {t('app.name')}
        </Typography>
        <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
        <Typography component="p" sx={{ fontSize: { xs: '1.25rem', md: '2rem' }, fontWeight: 600, lineHeight: 1.2, maxWidth: '16ch', textWrap: 'balance' }}>
          {t('login.sideTitle')}
        </Typography>
        <Typography sx={{ color: '#D6E6F7', maxWidth: '42ch', display: { xs: 'none', md: 'block' } }}>
          {t('login.sideBody')}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', px: { xs: 3, md: 8 }, py: { xs: 3, md: 5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            startIcon={<TranslateRounded />}
            onClick={() => void setLanguage(lang === 'en' ? 'ar' : 'en')}
            aria-label={t('language.switchLabel')}
            lang={lang === 'en' ? 'ar' : 'en'}
          >
            {t('language.switchTo')}
          </Button>
        </Box>
        <Box
          component="form"
          onSubmit={submit}
          noValidate
          sx={{ my: 'auto', width: '100%', maxWidth: 400, mx: 'auto', display: 'grid', gap: 2.5, py: 4 }}
        >
          <Box>
            <Typography variant="h1" sx={{ mb: 1 }}>
              {t('login.title')}
            </Typography>
            <Typography sx={{ color: color.muted }}>{t('login.subtitle')}</Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t('login.email')}
            helperText={t('login.emailHint')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            slotProps={{ htmlInput: { dir: 'ltr' } }}
          />
          <TextField
            label={t('login.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Button type="submit" variant="contained" size="large" disabled={submitting || !email || !password}>
            {submitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
