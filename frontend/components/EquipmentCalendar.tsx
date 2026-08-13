"use client"
import { useMemo, useState, useEffect, useRef } from "react"
import { EquipRow } from "@/components/EquipRow"

const TYPE_COLORS: Record<string, string> = {
  "Truck":            "#378ADD",
  "Van":              "#1D9E75",
  "Tractor/Mower":    "#D85A30",
  "Compact":          "#BA7517",
  "Heavy Equipment":  "#7F77DD",
  "Trailer":          "#D4537E",
  "Support Equipment":"#639922",
  "Other":            "#9CA3AF",
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function typeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS["Other"]
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function parseDate(d: string): { y: number; m: number; day: number } | null {
  if (!d || d.length < 8) return null
  const y = parseInt(d.slice(0, 4))
  const m = parseInt(d.slice(4, 6)) - 1
  const day = parseInt(d.slice(6, 8))
  if (isNaN(y) || isNaN(m) || isNaN(day)) return null
  return { y, m, day }
}

interface DayEntry {
  code: string
  desc: string
  equipType: string
  miles: number
  hours: number
  operators: Set<string>
  functions: Set<string>
  charges: Set<string>
}

interface CalendarCell {
  day: number
  inMonth: boolean
  isToday: boolean
  isWeekend: boolean
  dateKey: string
}

interface Props {
  allRows: EquipRow[]
  active: EquipRow[]
  focusDate?: string
}

export default function EquipmentCalendar({ active, focusDate }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  // Jump to the applied filter's start date whenever it changes
  useEffect(() => {
    if (!focusDate) return
    const parts = focusDate.split("-").map(Number)
    const [fy, fm] = parts
    if (!fy || !fm) return
    setYear(fy)
    setMonth(fm - 1)
    setSelectedDay(null)
  }, [focusDate])

  // Build usage map: day -> equipCode -> DayEntry
  const usageByDay = useMemo(() => {
    const map: Record<number, Record<string, DayEntry>> = {}
    active.forEach(r => {
      r.rawRows.forEach((row: any) => {
        const parsed = parseDate(String(row["Date"] || ""))
        if (!parsed) return
        if (parsed.y !== year || parsed.m !== month) return
        const d = parsed.day
        if (!map[d]) map[d] = {}
        if (!map[d][r.code]) {
          map[d][r.code] = {
            code: r.code,
            desc: r.desc,
            equipType: r.equipType,
            miles: 0,
            hours: 0,
            operators: new Set(),
            functions: new Set(),
            charges: new Set(),
          }
        }
        map[d][r.code].miles += Number(row["Run Miles"]) || 0
        map[d][r.code].hours += Number(row["Run Hours"]) || 0
        const op = (row["Remarks"] || "").trim()
        if (op) map[d][r.code].operators.add(op)
        const fn = (row["Function Description"] || "").trim()
        if (fn) map[d][r.code].functions.add(fn)
        const chargeCode = (row["Charge Code"] || "").trim()
        const chargeDesc = (row["Charge Description"] || "").trim()
        if (chargeCode || chargeDesc) {
          map[d][r.code].charges.add([chargeCode, chargeDesc].filter(Boolean).join(" — "))
        }
      })
    })
    return map
  }, [active, year, month])

  // Metrics for JUST the currently displayed month — the dashboard's top
  // metric cards reflect whatever date range is filtered up top, which can
  // span many months; these are scoped to this one calendar view instead.
  const monthStats = useMemo(() => {
    let miles = 0
    let hours = 0
    const vehicleCodes = new Set<string>()
    Object.values(usageByDay).forEach(dayMap => {
      Object.values(dayMap).forEach(entry => {
        miles += entry.miles
        hours += entry.hours
        vehicleCodes.add(entry.code)
      })
    })
    return {
      vehicles: vehicleCodes.size,
      miles,
      hours,
      activeDays: Object.keys(usageByDay).length,
    }
  }, [usageByDay])

  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" })
  const daysInMonth = getDaysInMonth(year, month)
  const firstDow = new Date(year, month, 1).getDay()
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7

  const cells: CalendarCell[] = useMemo(() => {
    const prevMonthDays = getDaysInMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1)
    const out: CalendarCell[] = []
    for (let i = 0; i < totalCells; i++) {
      const offset = i - firstDow
      let day: number, inMonth: boolean, cellMonth = month, cellYear = year
      if (offset < 0) {
        day = prevMonthDays + offset + 1
        inMonth = false
        cellMonth = month === 0 ? 11 : month - 1
        cellYear = month === 0 ? year - 1 : year
      } else if (offset >= daysInMonth) {
        day = offset - daysInMonth + 1
        inMonth = false
        cellMonth = month === 11 ? 0 : month + 1
        cellYear = month === 11 ? year + 1 : year
      } else {
        day = offset + 1
        inMonth = true
      }
      const dow = new Date(cellYear, cellMonth, day).getDay()
      const isToday = inMonth && cellYear === now.getFullYear() && cellMonth === now.getMonth() && day === now.getDate()
      out.push({
        day,
        inMonth,
        isToday,
        isWeekend: dow === 0 || dow === 6,
        dateKey: `${cellYear}-${cellMonth}-${day}`,
      })
    }
    return out
  }, [year, month, firstDow, daysInMonth, totalCells])

  function prevMonth() {
    setSelectedDay(null)
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    setSelectedDay(null)
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function goToday() {
    setSelectedDay(null)
    setYear(now.getFullYear())
    setMonth(now.getMonth())
  }

  // Close drawer on Escape / outside click
  useEffect(() => {
    if (selectedDay === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedDay(null)
    }
    function onClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setSelectedDay(null)
      }
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClick)
    }
  }, [selectedDay])

  const selectedEntries = selectedDay !== null
    ? Object.values(usageByDay[selectedDay] || {}).sort((a, b) =>
        a.equipType.localeCompare(b.equipType) || a.code.localeCompare(b.code))
    : []
  const selectedTotals = selectedEntries.reduce(
    (acc, e) => ({ miles: acc.miles + e.miles, hours: acc.hours + e.hours }),
    { miles: 0, hours: 0 }
  )

  const monthOptions = Array.from({ length: 12 }, (_, i) => i)
  const yearOptions = Array.from({ length: 13 }, (_, i) => now.getFullYear() - 10 + i)

  return (
    <div className="relative">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <select
            value={month}
            onChange={e => { setMonth(Number(e.target.value)); setSelectedDay(null) }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-semibold text-gray-400 bg-white"
          >
            {monthOptions.map(m => (
              <option key={m} value={m}>{new Date(2000, m, 1).toLocaleString("default", { month: "long" })}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => { setYear(Number(e.target.value)); setSelectedDay(null) }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-semibold text-gray-400 bg-white"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={goToday} className="ml-1 px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs text-gray-400 font-medium">
            Today
          </button>
        </div>

        <div className="flex flex-wrap gap-3 ml-auto">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-400">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics for this specific month */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          ["Vehicles active", monthStats.vehicles],
          [`${monthName} miles`, monthStats.miles.toFixed(0)],
          [`${monthName} hours`, monthStats.hours.toFixed(1)],
          ["Active days", monthStats.activeDays],
        ].map(([l, v]) => (
          <div key={String(l)} className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-600 mb-1">{l}</div>
            <div className="text-2xl font-medium text-gray-900">{v}</div>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DOW_LABELS.map(d => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-gray-500">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const dayEntries = cell.inMonth ? Object.values(usageByDay[cell.day] || {}) : []
            const hasData = dayEntries.length > 0
            const isSelected = cell.inMonth && selectedDay === cell.day

            return (
              <button
                key={i}
                onClick={() => cell.inMonth && hasData && setSelectedDay(cell.day)}
                disabled={!cell.inMonth || !hasData}
                className={`
                  relative flex flex-col items-stretch text-left border-b border-r border-gray-100 p-1.5
                  h-32 sm:h-40
                  ${!cell.inMonth ? "bg-gray-50/40" : cell.isWeekend ? "bg-gray-50/60" : "bg-white"}
                  ${cell.inMonth && hasData ? "hover:bg-blue-50/60 cursor-pointer" : cell.inMonth ? "" : ""}
                  ${isSelected ? "ring-2 ring-inset ring-blue-400" : ""}
                  ${(i + 1) % 7 === 0 ? "border-r-0" : ""}
                  transition-colors
                `}
              >
                <div className="flex items-center justify-between flex-shrink-0">
                  <span
                    className={`text-xs leading-none w-5 h-5 flex items-center justify-center rounded-full font-medium
                      ${!cell.inMonth ? "text-gray-300" : cell.isToday ? "bg-blue-600 text-white" : "text-gray-700"}
                    `}
                  >
                    {cell.day}
                  </span>
                  {dayEntries.length > 0 && (
                    <span className="text-[10px] text-gray-400 font-medium">{dayEntries.length}u</span>
                  )}
                </div>

                {hasData && (
                  <div className="mt-1 flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto">
                    {dayEntries.map(e => (
                      <div
                        key={e.code}
                        title={`${e.code} — ${e.desc}`}
                        className="flex items-center gap-1.5 text-xs text-gray-700 leading-tight"
                      >
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: typeColor(e.equipType) }} />
                        <span className="truncate">{e.code} {e.desc}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day detail drawer */}
      {selectedDay !== null && (
        <>
          <div className="fixed inset-0 bg-black/10 z-30" />
          <div
            ref={drawerRef}
            className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <div className="text-sm font-semibold text-gray-900">{monthName} {selectedDay}, {year}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {selectedEntries.length} unit{selectedEntries.length !== 1 ? "s" : ""}
                  {selectedTotals.miles > 0 && <> · <span className="text-blue-600">{selectedTotals.miles.toFixed(0)} mi</span></>}
                  {selectedTotals.hours > 0 && <> · <span className="text-green-600">{selectedTotals.hours.toFixed(1)} hrs</span></>}
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {selectedEntries.map(e => (
                <div key={e.code} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: typeColor(e.equipType) }} />
                    <span className="text-xs font-semibold text-gray-900">{e.code}</span>
                    <span className="text-xs text-gray-400 truncate">{e.desc}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    {e.miles > 0 && <span className="text-blue-600 font-medium">{e.miles.toFixed(0)} mi</span>}
                    {e.hours > 0 && <span className="text-green-600 font-medium">{e.hours.toFixed(1)} hrs</span>}
                  </div>
                  {e.operators.size > 0 && (
                    <div className="mt-1 text-xs text-gray-500">Op: {[...e.operators].join(", ")}</div>
                  )}
                  {e.charges.size > 0 && (
                    <div className="text-xs text-gray-500">Charge: {[...e.charges].join(", ")}</div>
                  )}
                  {e.functions.size > 0 && (
                    <div className="text-xs text-gray-400">{[...e.functions].join(", ")}</div>
                  )}
                </div>
              ))}
              {selectedEntries.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400">No activity this day</div>
              )}
            </div>
          </div>
        </>
      )}

      {active.length === 0 && (
        <div className="mt-3 text-center text-sm text-gray-400">No equipment data for this period</div>
      )}
    </div>
  )
}
