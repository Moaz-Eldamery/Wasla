import TableChartRounded from '@mui/icons-material/TableChartRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { color } from '../../theme.ts'
import { currentLanguage } from '../../translations/i18n.ts'
import { formatAxisDay, formatFullDay, niceTicks, type Series } from './statistics.ts'

const HEIGHT = 232
const TOP = 14
const BOTTOM = 30
const AXIS = 48
const GAP = 2

interface ChartProps {
  dates: string[]
  series: Series[]
  /** Formats a value for axis, tooltip and table. */
  format(value: number): string
  /** Stacked columns sum the series; a line draws its one series. */
  kind: 'columns' | 'line'
  /** What the chart shows, read out by screen readers. */
  label: string
  /** Extra row in the tooltip and table, e.g. the day's total visits. */
  total?: { label: string }
}

/** Width of the element, following it as the layout changes. Falls back to 640 where there is no layout (tests). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

/** A rectangle with 4px rounded corners on its top only, square at the baseline. */
function topRounded(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/**
 * A day-by-day chart with a hover and keyboard readout and a table view.
 * Time runs with the reading direction: left to right in English, right to
 * left in Arabic. Null values are gaps, never zero.
 */
export function DayChart({ dates, series, format, kind, label, total }: ChartProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const rtl = lang === 'ar'
  const { ref, width } = useWidth()
  const [active, setActive] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  const n = dates.length
  const endPad = kind === 'line' ? 60 : 12
  const plot = Math.max(120, width - AXIS - endPad)
  const band = plot / Math.max(1, n)
  const totals = dates.map((_, i) => {
    const vals = series.map((s) => s.values[i])
    return vals.every((v) => v === null) ? null : vals.reduce<number>((sum, v) => sum + (v ?? 0), 0)
  })
  const peak = kind === 'columns' ? Math.max(0, ...totals.map((v) => v ?? 0)) : Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)))
  const ticks = niceTicks(peak)
  const top = ticks[ticks.length - 1]
  const y = (v: number) => TOP + (HEIGHT - TOP - BOTTOM) * (1 - v / top)
  /** Centre of day `i`, measured from the chart's start edge, then mirrored for Arabic. */
  const x = (i: number) => {
    const fromStart = AXIS + band * (i + 0.5)
    return rtl ? width - fromStart : fromStart
  }
  const long = n > 14
  // Arabic weekday names are longer, so they need more room before every label fits.
  const labelRoom = long ? (rtl ? 66 : 58) : rtl ? 74 : 50
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plot / labelRoom))))

  const indexAt = (clientX: number, rect: DOMRect) => {
    const px = rtl ? rect.right - clientX : clientX - rect.left
    const i = Math.floor((px - AXIS) / band)
    return i >= 0 && i < n ? i : null
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => setActive(indexAt(e.clientX, e.currentTarget.getBoundingClientRect()))
  const onKeyDown = (e: KeyboardEvent) => {
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    let next: number | null = null
    if (e.key === forward) next = Math.min(n - 1, (active ?? -1) + 1)
    else if (e.key === back) next = Math.max(0, (active ?? n) - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') {
      setActive(null)
      return
    }
    if (next !== null) {
      e.preventDefault()
      setActive(next)
    }
  }

  const notAvailable = t('stats.notAvailable')
  const readout = (i: number) => {
    if (totals[i] === null) return `${formatFullDay(dates[i], lang)}. ${notAvailable}`
    const rows = series.map((s) => `${s.label}: ${s.values[i] === null ? notAvailable : format(s.values[i]!)}`)
    if (total) rows.push(`${total.label}: ${totals[i] === null ? notAvailable : format(totals[i]!)}`)
    return `${formatFullDay(dates[i], lang)}. ${rows.join(lang === 'ar' ? '، ' : ', ')}`
  }

  // The line's last measured point carries its value as a direct label.
  const line = kind === 'line' ? series[0] : undefined
  const lastIndex = line ? line.values.reduce<number>((last, v, i) => (v === null ? last : i), -1) : -1

  return (
    <Box>
      {series.length > 1 && (
        <Box component="ul" aria-label={t('stats.legend')} sx={{ listStyle: 'none', m: 0, mb: 1.5, p: 0, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.75 }}>
          {series.map((s) => (
            <Box component="li" key={s.key} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.8125rem', color: color.inkSoft }}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: s.color, flexShrink: 0 }} />
              {s.label}
            </Box>
          ))}
        </Box>
      )}

      <Box
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={`${label}. ${t('stats.keyboardHint')}`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        sx={{ position: 'relative', borderRadius: '8px', '&:focus-visible': { outline: `2px solid ${color.brand}`, outlineOffset: '4px' } }}
      >
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={label}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          // Positions are already mirrored for Arabic, so the drawing itself stays left-to-right.
          direction="ltr"
          style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y', direction: 'ltr' }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={rtl ? width - AXIS : AXIS} x2={rtl ? endPad : width - endPad} y1={y(v)} y2={y(v)} stroke={v === 0 ? color.rule : color.ruleSoft} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={rtl ? width - AXIS + 8 : AXIS - 8} y={y(v)} dy="0.32em" textAnchor={rtl ? 'start' : 'end'} fontSize={12} fill={color.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {format(v)}
              </text>
            </g>
          ))}

          {dates.map((d, i) =>
            i % every === 0 ? (
              <text key={d} x={x(i)} y={HEIGHT - 10} textAnchor="middle" fontSize={12} fill={i === active ? color.ink : color.muted} fontWeight={i === active ? 600 : 400}>
                {formatAxisDay(d, lang, long)}
              </text>
            ) : null,
          )}

          {kind === 'columns' &&
            dates.map((d, i) => {
              const w = Math.min(24, band * 0.62)
              const left = x(i) - w / 2
              // Each segment sits on the sum of the ones below it, with a 2px gap between them.
              const drawn = series.filter((s) => (s.values[i] ?? 0) > 0)
              const bases = drawn.map((_, j) => drawn.slice(0, j).reduce((sum, s) => sum + s.values[i]!, 0))
              return (
                <g key={d} opacity={active === null || active === i ? 1 : 0.5} style={{ transition: 'opacity 120ms ease-out' }}>
                  {drawn.map((s, j) => {
                    const yTop = y(bases[j] + s.values[i]!)
                    const h = Math.max(0, y(bases[j]) - (j > 0 ? GAP : 0) - yTop)
                    if (h <= 0) return null
                    return j === drawn.length - 1 ? (
                      <path key={s.key} d={topRounded(left, yTop, w, h)} fill={s.color} />
                    ) : (
                      <rect key={s.key} x={left} y={yTop} width={w} height={h} fill={s.color} />
                    )
                  })}
                </g>
              )
            })}

          {line && (
            <>
              <path
                d={line.values
                  .map((v, i) => (v === null ? null : `${i === 0 || line.values[i - 1] === null ? 'M' : 'L'}${x(i)},${y(v)}`))
                  .filter(Boolean)
                  .join('')}
                fill="none"
                stroke={line.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {line.values.map((v, i) =>
                v !== null && (n <= 31 || i === lastIndex || i === active) ? (
                  <circle key={dates[i]} cx={x(i)} cy={y(v)} r={i === active ? 5 : 4} fill={line.color} stroke={color.panel} strokeWidth={2} />
                ) : null,
              )}
              {lastIndex >= 0 && (
                <text
                  x={x(lastIndex) + (rtl ? -10 : 10)}
                  y={y(line.values[lastIndex]!)}
                  dy="0.32em"
                  textAnchor={rtl ? 'end' : 'start'}
                  fontSize={12}
                  fontWeight={600}
                  fill={color.ink}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {format(line.values[lastIndex]!)}
                </text>
              )}
            </>
          )}

          {kind === 'line' && active !== null && (
            <line x1={x(active)} x2={x(active)} y1={TOP} y2={HEIGHT - BOTTOM} stroke={color.muted} strokeOpacity={0.45} strokeWidth={1} shapeRendering="crispEdges" />
          )}
        </svg>

        {active !== null && (
          <Box
            aria-hidden
            // Beside the day, on whichever side has room; inline, so the right-to-left style pass doesn't flip it.
            style={x(active) < width / 2 ? { left: x(active) + 18 } : { left: x(active) - 18, transform: 'translateX(-100%)' }}
            sx={{
              position: 'absolute',
              top: 4,
              minWidth: 168,
              maxWidth: 280,
              bgcolor: color.panel,
              border: `1px solid ${color.rule}`,
              borderRadius: '10px',
              boxShadow: '0 6px 20px rgba(15, 23, 42, 0.12)',
              px: 1.5,
              py: 1,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <Typography variant="body2" sx={{ color: color.muted, mb: 0.5 }}>
              {formatFullDay(dates[active], lang)}
            </Typography>
            {totals[active] === null ? (
              <TooltipRow value={notAvailable} />
            ) : (
              <>
                {series.map((s) => (
                  <TooltipRow key={s.key} swatch={s.color} line={kind === 'line'} value={s.values[active] === null ? notAvailable : format(s.values[active]!)} label={series.length > 1 || kind === 'columns' ? s.label : undefined} />
                ))}
                {total && series.length > 1 && <TooltipRow value={format(totals[active]!)} label={total.label} />}
              </>
            )}
          </Box>
        )}
        <Box role="status" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {active !== null ? readout(active) : ''}
        </Box>
      </Box>

      <Button size="small" startIcon={<TableChartRounded />} onClick={() => setShowTable((s) => !s)} aria-expanded={showTable} aria-controls={tableId} sx={{ mt: 1, color: color.inkSoft }}>
        {showTable ? t('stats.hideTable') : t('stats.showTable')}
      </Button>
      {showTable && (
        <Box id={tableId} sx={{ mt: 1, maxHeight: 320, overflow: 'auto', border: `1px solid ${color.rule}`, borderRadius: '8px' }}>
          <Table size="small" aria-label={label} stickyHeader sx={{ '& th': { bgcolor: color.brandWash, fontWeight: 600, color: color.inkSoft } }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('stats.day')}</TableCell>
                {series.map((s) => (
                  <TableCell key={s.key} align="right">
                    {s.label}
                  </TableCell>
                ))}
                {total && series.length > 1 && <TableCell align="right">{total.label}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {dates.map((d, i) => (
                <TableRow key={d}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatFullDay(d, lang)}</TableCell>
                  {series.map((s) => (
                    <TableCell key={s.key} align="right" className="tabular" sx={{ color: s.values[i] === null ? color.muted : undefined }}>
                      {s.values[i] === null ? notAvailable : format(s.values[i]!)}
                    </TableCell>
                  ))}
                  {total && series.length > 1 && (
                    <TableCell align="right" className="tabular" sx={{ fontWeight: 600, color: totals[i] === null ? color.muted : undefined }}>
                      {totals[i] === null ? notAvailable : format(totals[i]!)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}

/** Value first and strong, then the series name, keyed by a short stroke or swatch of its colour. */
function TooltipRow({ swatch, line, value, label }: { swatch?: string; line?: boolean; value: string; label?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.125 }}>
      {swatch ? (
        <Box component="span" sx={{ width: line ? 12 : 8, height: line ? 2 : 8, borderRadius: line ? 1 : '2px', bgcolor: swatch, flexShrink: 0 }} />
      ) : (
        <Box component="span" sx={{ width: 8, flexShrink: 0 }} />
      )}
      <Typography component="span" className="tabular" sx={{ fontWeight: 600, fontSize: '0.875rem', color: color.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {value}
      </Typography>
      {label && (
        <Typography component="span" variant="body2" sx={{ color: color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
      )}
    </Box>
  )
}
