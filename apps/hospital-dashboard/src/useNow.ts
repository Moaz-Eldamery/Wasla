import { useEffect, useState } from 'react'

/** The current time, ticking every 30 seconds so the "now" line, late marks and the date move on their own. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
