import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import SendRounded from '@mui/icons-material/SendRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../components/AppShell.tsx'
import { askChatbot, type ChatbotAnswer } from '../../lib/api.ts'
import { errorMessage, localized } from '../../translations/i18n.ts'

type Conversation = {
  question: string
  response: ChatbotAnswer
}

export function AdminPage() {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('')
  const [conversation, setConversation] = useState<Conversation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = question.trim()
    if (!value || sending) return

    setSending(true)
    setError(null)
    try {
      const response = await askChatbot(value)
      setConversation((current) => [...current, { question: value, response }])
      setQuestion('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSending(false)
    }
  }

  return (
    <AppShell>
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              {t('adminChatbot.title')}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {t('adminChatbot.intro')}
            </Typography>
          </Box>

          <Alert severity="info">{t('adminChatbot.privacy')}</Alert>

          <Paper component="form" onSubmit={submitQuestion} elevation={1} sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={2}>
              <TextField
                label={t('adminChatbot.question')}
                placeholder={t('adminChatbot.placeholder')}
                value={question}
                onChange={(event) => setQuestion(event.target.value.slice(0, 1000))}
                multiline
                minRows={2}
                maxRows={6}
                slotProps={{ htmlInput: { maxLength: 1000, 'aria-describedby': 'chatbot-question-count' } }}
                disabled={sending}
                fullWidth
              />
              <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography id="chatbot-question-count" variant="caption" color="text.secondary">
                  {t('adminChatbot.characterCount', { count: question.length })}
                </Typography>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SendRounded />}
                  disabled={sending || !question.trim()}
                >
                  {sending ? t('adminChatbot.sending') : t('adminChatbot.send')}
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {error && <Alert severity="error" role="alert">{error}</Alert>}

          <Stack spacing={2} aria-live="polite">
            {conversation.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <AutoAwesomeRounded color="primary" />
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {t('adminChatbot.empty')}
                </Typography>
              </Paper>
            ) : (
              conversation.map(({ question: asked, response }, index) => (
                <Paper key={`${index}-${asked}`} variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        {t('adminChatbot.question')}
                      </Typography>
                      <Typography dir="auto">{asked}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        {t('adminChatbot.answer')}
                      </Typography>
                      <Typography dir="auto" lang={response.language} sx={{ whiteSpace: 'pre-wrap' }}>
                        {response.answer}
                      </Typography>
                    </Box>
                    {response.sources.length > 0 && (
                      <Box>
                        <Typography variant="overline" color="text.secondary">
                          {t('adminChatbot.sources')}
                        </Typography>
                        <Stack component="ul" spacing={0.5} sx={{ mt: 0.5, mb: 0, pl: 2 }}>
                          {response.sources.map((source) => (
                            <li key={source.entryId}>
                              <Typography variant="body2" dir="auto">
                                {localized(source.title)} <span>({source.entryId})</span>
                              </Typography>
                            </li>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>
        </Stack>
      </Container>
    </AppShell>
  )
}
