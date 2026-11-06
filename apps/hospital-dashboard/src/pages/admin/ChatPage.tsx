import AddCommentRounded from '@mui/icons-material/AddCommentRounded'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import MenuBookRounded from '@mui/icons-material/MenuBookRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, askChatbot, CHAT_QUESTION_MAX, type ChatbotAnswer } from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { currentLanguage, errorMessage, localized } from '../../translations/i18n.ts'

/** One question and what came back for it. */
export interface Turn {
  id: string
  question: string
  state: 'pending' | 'answered' | 'unavailable' | 'failed'
  answer?: ChatbotAnswer
  error?: string
}

/** The thread lives in this tab only (sessionStorage) and is cleared on logout or "New conversation". */
const THREAD_KEY = 'wasla.chat'
function loadThread(): Turn[] {
  try {
    const raw = sessionStorage.getItem(THREAD_KEY)
    // A turn still pending when the page went away never got its answer.
    return raw ? (JSON.parse(raw) as Turn[]).map((t) => (t.state === 'pending' ? { ...t, state: 'failed' } : t)) : []
  } catch {
    return []
  }
}
function saveThread(turns: Turn[]): void {
  try {
    if (turns.length) sessionStorage.setItem(THREAD_KEY, JSON.stringify(turns))
    else sessionStorage.removeItem(THREAD_KEY)
  } catch {
    // Without storage the thread lasts until the page reloads.
  }
}

/**
 * The admin's hospital-information assistant (KAN-20, `/admin/assistant`): ask in English or
 * Arabic, read the answer with its sources, and see plainly when the
 * assistant doesn't know or is down.
 */
export function ChatPage() {
  const { t } = useTranslation()
  const [turns, setTurns] = useState<Turn[]>(loadThread)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const busy = turns.some((x) => x.state === 'pending')
  const tooLong = draft.length > CHAT_QUESTION_MAX

  useEffect(() => saveThread(turns), [turns])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [turns])

  const ask = async (question: string, replaceId?: string) => {
    const text = question.trim()
    if (!text || text.length > CHAT_QUESTION_MAX) return
    const id = replaceId ?? `${Date.now()}`
    setTurns((all) =>
      replaceId ? all.map((x) => (x.id === id ? { id, question: text, state: 'pending' } : x)) : [...all, { id, question: text, state: 'pending' }],
    )
    try {
      const answer = await askChatbot(text)
      setTurns((all) => all.map((x) => (x.id === id ? { ...x, state: 'answered', answer } : x)))
    } catch (error) {
      const unavailable = error instanceof ApiError && (error.code === 'AI_UNAVAILABLE' || error.status === 503)
      setTurns((all) =>
        all.map((x) => (x.id === id ? { ...x, state: unavailable ? 'unavailable' : 'failed', error: unavailable ? undefined : errorMessage(error) } : x)),
      )
    }
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (busy || tooLong || !draft.trim()) return
    void ask(draft)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const suggestions = t('chat.suggestions', { returnObjects: true }) as string[]

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: { sm: 'calc(100vh - 64px)' } }}>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box sx={{ maxWidth: 820, mx: 'auto', px: { xs: 2, md: 3 }, pt: { xs: 3, md: 5 }, pb: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'flex-start', gap: { xs: 1, sm: 2 }, mb: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h1">{t('chat.title')}</Typography>
              <Typography sx={{ color: color.muted, mt: 1, maxWidth: '68ch' }}>{t('chat.intro')}</Typography>
            </Box>
            {turns.length > 0 && (
              <Button startIcon={<AddCommentRounded />} onClick={() => setTurns([])} disabled={busy} sx={{ flexShrink: 0 }}>
                {t('chat.newConversation')}
              </Button>
            )}
          </Box>

          {turns.length === 0 ? (
            <Box>
              <Typography variant="h3" component="h2" sx={{ color: color.inkSoft, textTransform: 'uppercase', mb: 1.25 }}>
                {t('chat.tryAsking')}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                {suggestions.map((q) => (
                  <Button
                    key={q}
                    variant="outlined"
                    onClick={() => void ask(q)}
                    sx={{ justifyContent: 'flex-start', textAlign: 'start', py: 1.5, px: 2, color: color.ink, borderColor: color.rule, bgcolor: color.panel, fontWeight: 500, '&:hover': { borderColor: color.brand, bgcolor: color.brandWash } }}
                  >
                    {q}
                  </Button>
                ))}
              </Box>
            </Box>
          ) : (
            <Box component="ol" aria-label={t('chat.thread')} aria-live="polite" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3 }}>
              {turns.map((turn) => (
                <TurnView key={turn.id} turn={turn} onRetry={() => void ask(turn.question, turn.id)} retryDisabled={busy} />
              ))}
            </Box>
          )}
          <div ref={endRef} />
        </Box>
      </Box>

      <Box sx={{ borderTop: `1px solid ${color.rule}`, bgcolor: color.ground, px: { xs: 2, md: 3 }, py: 2, position: 'sticky', bottom: 0, zIndex: 1 }}>
        <Box component="form" onSubmit={submit} sx={{ maxWidth: 820, mx: 'auto' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1,
              bgcolor: color.panel,
              border: `1px solid ${tooLong ? color.now : color.rule}`,
              borderRadius: '14px',
              px: 2,
              py: 1.25,
              boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
              '&:focus-within': { borderColor: tooLong ? color.now : color.brand, boxShadow: `0 0 0 3px ${tooLong ? color.nowTint : color.brandTint}` },
            }}
          >
            <InputBase
              inputRef={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('chat.placeholder')}
              multiline
              maxRows={6}
              fullWidth
              autoFocus
              inputProps={{ 'aria-label': t('chat.label'), dir: 'auto' }}
              sx={{ fontSize: '1rem', py: 0.5 }}
            />
            <Tooltip title={t('chat.send')}>
              <span>
                <IconButton
                  type="submit"
                  aria-label={t('chat.send')}
                  disabled={busy || tooLong || !draft.trim()}
                  sx={{ bgcolor: color.brand, color: '#FFFFFF', '&:hover': { bgcolor: color.brandDeep }, '&.Mui-disabled': { bgcolor: color.ruleSoft, color: '#94A3B8' } }}
                >
                  {busy ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : <ArrowUpwardRounded />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 0.75, px: 0.5 }}>
            <Typography variant="body2" sx={{ color: tooLong ? color.now : color.muted }}>
              {tooLong ? t('chat.tooLong', { max: CHAT_QUESTION_MAX }) : t('chat.hint')}
            </Typography>
            {draft.length > CHAT_QUESTION_MAX * 0.8 && (
              <Typography variant="body2" className="tabular" sx={{ color: tooLong ? color.now : color.muted }}>
                {t('chat.count', { count: draft.length, max: CHAT_QUESTION_MAX })}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function TurnView({ turn, onRetry, retryDisabled }: { turn: Turn; onRetry(): void; retryDisabled: boolean }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const answered = turn.state === 'answered' && turn.answer
  const noInfo = answered && turn.answer!.status === 'NO_INFORMATION'
  return (
    <Box component="li" sx={{ display: 'grid', gap: 1.25 }}>
      <Box sx={{ justifySelf: 'end', maxWidth: '85%' }}>
        <Typography variant="body2" sx={{ color: color.muted, textAlign: 'end', mb: 0.5 }}>{t('chat.you')}</Typography>
        <Typography dir="auto" sx={{ bgcolor: color.brand, color: '#FFFFFF', px: 2, py: 1.25, borderRadius: '14px', borderEndEndRadius: '4px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {turn.question}
        </Typography>
      </Box>

      <Box sx={{ maxWidth: '92%' }}>
        <Typography variant="body2" sx={{ color: color.muted, mb: 0.5 }}>{t('chat.assistant')}</Typography>
        {turn.state === 'pending' && (
          <Box role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, bgcolor: color.panel, border: `1px solid ${color.rule}`, borderRadius: '14px' }}>
            <CircularProgress size={16} />
            <Typography sx={{ color: color.muted }}>{t('chat.thinking')}</Typography>
          </Box>
        )}
        {answered && !noInfo && (
          <Box sx={{ bgcolor: color.panel, border: `1px solid ${color.rule}`, borderRadius: '14px', borderStartStartRadius: '4px', px: 2.25, py: 1.75 }}>
            <Typography dir={turn.answer!.language === 'ar' ? 'rtl' : 'ltr'} lang={turn.answer!.language} sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, overflowWrap: 'anywhere', textAlign: 'start' }}>
              {turn.answer!.answer}
            </Typography>
            {turn.answer!.sources.length > 0 && (
              <Box sx={{ mt: 1.75, pt: 1.5, borderTop: `1px solid ${color.ruleSoft}` }}>
                <Typography variant="h3" component="h3" sx={{ color: color.inkSoft, textTransform: 'uppercase', mb: 1 }}>{t('chat.sources')}</Typography>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {turn.answer!.sources.map((s) => (
                    <Box
                      component="li"
                      key={s.entryId}
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.5, borderRadius: '8px', bgcolor: color.brandWash, color: color.brandDeep, fontSize: '0.875rem', fontWeight: 500 }}
                    >
                      <MenuBookRounded sx={{ fontSize: 16 }} />
                      {localized(s.title, lang)}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}
        {noInfo && <Alert severity="info" sx={{ borderRadius: '14px' }}>{t('chat.noInformation')}</Alert>}
        {(turn.state === 'unavailable' || turn.state === 'failed') && (
          <Alert
            severity="warning"
            sx={{ borderRadius: '14px' }}
            action={<Button color="inherit" size="small" onClick={onRetry} disabled={retryDisabled} sx={{ whiteSpace: 'nowrap' }}>{t('chat.retry')}</Button>}
          >
            {turn.state === 'unavailable' ? t('chat.unavailable') : `${t('chat.failed')} ${turn.error ?? ''}`}
          </Alert>
        )}
      </Box>
    </Box>
  )
}
