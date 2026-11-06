import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { prefixer } from 'stylis'
import rtlPlugin from 'stylis-plugin-rtl'
import { ApiError } from './lib/api.ts'
import { SessionProvider } from './session.tsx'
import { buildTheme } from './theme.ts'

// One style cache per direction: the RTL one mirrors MUI's physical properties for Arabic.
const caches = {
  ltr: createCache({ key: 'mui' }),
  rtl: createCache({ key: 'mui-rtl', stylisPlugins: [prefixer, rtlPlugin] }),
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't retry what retrying can't fix: a missing session, a forbidden or missing record.
        retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
        refetchOnWindowFocus: true,
      },
    },
  })
}

/** Theme, direction, data cache and session around the whole app. */
export function Providers({ children, queryClient }: { children: ReactNode; queryClient?: QueryClient }) {
  const { i18n } = useTranslation()
  const direction = i18n.language === 'ar' ? 'rtl' : 'ltr'
  const theme = useMemo(() => buildTheme(direction), [direction])
  const [client] = useState(() => queryClient ?? createQueryClient())
  return (
    <CacheProvider value={caches[direction]}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={client}>
          <SessionProvider>{children}</SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  )
}
