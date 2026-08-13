"use client"
import { useEffect, useRef, useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import axios from "axios"
import { EquipRow } from "@/components/EquipRow"
import EquipmentBarCharts from "@/components/EquipmentBarCharts"
import EquipmentTable from "@/components/EquipmentTable"
import EquipmentCalendar from "@/components/EquipmentCalendar"

type LegendItem = { label: string; value: number; color: string; pct: number }
type Tab = "charts" | "calendar"

const EQUIP_TYPE_MAP: Record<string, string> = {
  // ---------- Truck ----------
  "UTILITY TRUCK": "Truck",
  "HOOK LIFT": "Truck",
  "TANK TRUCK": "Truck",
  "SERVICE TRUCK": "Truck",
  "DUMP TRUCK": "Truck",
  "STAKE": "Truck",
  "CAB/CHASSIS": "Truck",
  "CREW CAB": "Truck",
  "PICKUP": "Truck",
  "P/U": "Truck",
  "TRUCK": "Truck",
  "F150": "Truck",
  "F250": "Truck",
  "F350": "Truck",
  "F450": "Truck",
 
  // ---------- Van ----------
  "PASSENGER VAN": "Van",
  "VAN": "Van",
 
  // ---------- Tractor / Mower ----------
  "GUARDRAIL MOWER": "Tractor/Mower",
  "ZERO TURN": "Tractor/Mower",
  "ROTARY": "Tractor/Mower",
  "MOWER": "Tractor/Mower",
  "TRACTOR": "Tractor/Mower",
 
  // ---------- Compact ----------
  "MINI EXCAVATOR": "Compact",
  "TRACKLOADER": "Compact",
  "TRACK LOADER": "Compact",
  "SKIDSTEER": "Compact",
  "SKID STEER": "Compact",
  "COMPACT": "Compact",

  // ---------- Heavy Equipment ----------
  "BACKHOE": "Heavy Equipment",
  "EXCAVATOR": "Heavy Equipment",
  "LOADER": "Heavy Equipment",
  "GRADER": "Heavy Equipment",
  "ROLLER": "Heavy Equipment",
  "CRANE": "Heavy Equipment",

  // ---------- Trailer ----------
  "LOWBOY": "Trailer",
  "BOAT TRAILER": "Trailer",
  "TRAILER": "Trailer",

  // ---------- Support Equipment ----------
  "MESSAGE BOARD": "Support Equipment",
  "WANCO": "Support Equipment",
  "CHIPPER": "Support Equipment",
  "AERIAL": "Support Equipment",
  "GENERATOR": "Support Equipment",
  "COMPRESSOR": "Support Equipment",
};

function getEquipType(desc: string): string {
  const upper = desc.toUpperCase()
  for (const [key, type] of Object.entries(EQUIP_TYPE_MAP)) {
    if (upper.includes(key)) return type
  }
  return "Other"
}

function buildRows(data: any[]): EquipRow[] {
  const map: Record<string, EquipRow> = {}
  data.forEach((r: any) => {
    const fleet = String(r["Fleet Code"] || "").trim()
    const unit = String(r["Unit Number"] || "").trim()
    const fleetDigit = fleet.length >= 4 ? fleet[3] : ""
    const equipId = fleetDigit && unit ? `${fleetDigit}${unit}` : unit || "Unknown"
    const desc = String(r["Equipment Description"] || "").trim()

    if (!map[equipId]) map[equipId] = {
      code: equipId,
      year: String(r["Equipment Year"] || "").trim(),
      desc,
      crew: String(r["Crew Code"] || "").trim(),
      equipType: getEquipType(desc),
      totalMiles: 0,
      totalHours: 0,
      daysUsed: new Set(),
      functions: {},
      operators: new Set(),
      rawRows: [],
    }
    map[equipId].totalMiles += Number(r["Run Miles"]) || 0
    map[equipId].totalHours += Number(r["Run Hours"]) || 0
    if (r["Date"]) map[equipId].daysUsed.add(String(r["Date"]))
    const fn = String(r["Function Description"] || "").trim()
    if (fn) map[equipId].functions[fn] = (map[equipId].functions[fn] || 0) + (Number(r["Run Miles"]) || 0)
    const op = String(r["Remarks"] || "").trim()
    if (op) map[equipId].operators.add(op)
    map[equipId].rawRows.push(r)
  })
  return Object.values(map)
}

export default function EquipmentDashboard() {
  const router = useRouter()
  const [rawData, setRawData] = useState<any[]>([])
  const [allRows, setAllRows] = useState<EquipRow[]>([])
  const [selectedEquip, setSelectedEquip] = useState<Set<string>>(new Set())
  const [crews, setCrews] = useState<string[]>([])
  const [selectedFunctions, setSelectedFunctions] = useState<Set<string>>(new Set())
  const [functionDropdownOpen, setFunctionDropdownOpen] = useState(false)
  const functionButtonRef = useRef<HTMLButtonElement>(null)
  const functionPanelRef = useRef<HTMLDivElement>(null)
  const [functionDropdownPos, setFunctionDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [crew, setCrew] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [onSiteOnly, setOnSiteOnly] = useState(false)
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false)
  const typeButtonRef = useRef<HTMLButtonElement>(null)
  const typePanelRef = useRef<HTMLDivElement>(null)
  const [typeDropdownPos, setTypeDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const [fnLegend, setFnLegend] = useState<LegendItem[]>([])
  const [tab, setTab] = useState<Tab>("charts")
  const [calendarFocusDate, setCalendarFocusDate] = useState("")

  const active = useMemo(
    () => allRows.filter(r => selectedEquip.has(r.code)),
    [allRows, selectedEquip]
  )

  const equipTypes = useMemo(() =>
    [...new Set(allRows.map(r => r.equipType).filter(Boolean))].sort(),
    [allRows]
  )

  // Function code options are scoped to the currently selected equipment
  // type(s) — computed per raw row (getEquipType is a pure function of the
  // description string, so this doesn't need buildRows/aggregation at all).
  // No types selected means no type-based restriction (all functions shown).
  const functionOptions = useMemo(() => {
    const set = new Set<string>()
    rawData.forEach((r: any) => {
      if (selectedTypes.size > 0) {
        const rowType = getEquipType(String(r["Equipment Description"] || ""))
        if (!selectedTypes.has(rowType)) return
      }
      const fn = String(r["Function Description"] || "").trim()
      if (fn) set.add(fn)
    })
    return [...set].sort()
  }, [rawData, selectedTypes])

  // If narrowing equipment types drops a previously-selected function code
  // out of the available list, drop it from the selection too rather than
  // leaving a phantom filter active that no longer corresponds to anything.
  useEffect(() => {
    setSelectedFunctions(prev => {
      const filtered = new Set([...prev].filter(f => functionOptions.includes(f)))
      return filtered.size === prev.size ? prev : filtered
    })
  }, [functionOptions])

  const totalMiles = useMemo(() => active.reduce((s, r) => s + r.totalMiles, 0), [active])
  const totalHours = useMemo(() => active.reduce((s, r) => s + r.totalHours, 0), [active])
  const totalDays = useMemo(() => new Set(active.flatMap(r => [...r.daysUsed])).size, [active])
  const totalVehicles = active.length

  function applyFilters(data: any[], s: string, e: string, c: string, types: Set<string>, onSite: boolean, functions: Set<string>) {
    const sf = s.replace(/-/g, "")
    const ef = e.replace(/-/g, "")
    const filtered = data.filter((r: any) => {
      const d = String(r["Date"] || "")
      if (sf && d < sf) return false
      if (ef && d > ef) return false
      if (c && r["Crew Code"] !== c) return false
      if (onSite && String(r["Charge Code"] || "").trim().startsWith("8")) return false
      if (functions.size > 0 && !functions.has(String(r["Function Description"] || "").trim())) return false
      return true
    })
    const rows = buildRows(filtered)
    const finalRows = types.size > 0 ? rows.filter(r => types.has(r.equipType)) : rows
    setAllRows(finalRows)
    setSelectedEquip(new Set(finalRows.map(r => r.code)))
    setCalendarFocusDate(s || e || "")
    localStorage.setItem("shared_filter_start", s)
    localStorage.setItem("shared_filter_end", e)
    localStorage.setItem("shared_filter_crew", c)
  }

  function applyQuickRange(months: number | "ytd") {
    const now = new Date()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    let s: string
    let e: string

    if (months === "ytd") {
      s = fmt(new Date(now.getFullYear(), 0, 1))
      e = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    } else {
      // Start = first day of the month N months ago
      const startMonth = now.getMonth() - (months as number) + 1
      const start = new Date(now.getFullYear(), startMonth, 1)
      // End = last day of current month
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      s = fmt(start)
      e = fmt(end)
    }

    setStartDate(s)
    setEndDate(e)
    applyFilters(rawData, s, e, crew, selectedTypes, onSiteOnly, selectedFunctions)
  }

  function toggleOnSite() {
    const next = !onSiteOnly
    setOnSiteOnly(next)
    applyFilters(rawData, startDate, endDate, crew, selectedTypes, next, selectedFunctions)
  }

  function toggleType(t: string) {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function toggleFunction(f: string) {
    setSelectedFunctions(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  function openTypeDropdown() {
    if (typeButtonRef.current) {
      const rect = typeButtonRef.current.getBoundingClientRect()
      setTypeDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
    setTypeDropdownOpen(o => !o)
  }

  function openFunctionDropdown() {
    if (functionButtonRef.current) {
      const rect = functionButtonRef.current.getBoundingClientRect()
      setFunctionDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
    setFunctionDropdownOpen(o => !o)
  }

  // Close either dropdown when clicking outside its own button+panel pair
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        typeButtonRef.current && !typeButtonRef.current.contains(target) &&
        typePanelRef.current && !typePanelRef.current.contains(target)
      ) {
        setTypeDropdownOpen(false)
      }
      if (
        functionButtonRef.current && !functionButtonRef.current.contains(target) &&
        functionPanelRef.current && !functionPanelRef.current.contains(target)
      ) {
        setFunctionDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => {
    const session_id = localStorage.getItem("equipment_session_id")
    if (!session_id) { router.push("/upload"); return }
    axios.get(`http://localhost:8000/api/session/equipment/${session_id}`)
      .then(res => {
        const data = res.data.raw || []
        setRawData(data)
        setCrews([...new Set<string>(data.map((r: any) => r["Crew Code"]).filter(Boolean))].sort())
        applyFilters(data, "", "", "", new Set(), false, new Set())
      })
      .catch(() => router.push("/upload"))
  }, [])

  function toggleEquip(code: string, checked: boolean) {
    setSelectedEquip(prev => {
      const next = new Set(prev)
      if (checked) next.add(code)
      else next.delete(code)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelectedEquip(checked ? new Set(allRows.map(r => r.code)) : new Set())
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium">Equipment Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/map")} className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            Combined Map
          </button>
          <button onClick={() => router.push("/upload")} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            Upload new file
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-nowrap items-end justify-between gap-3 mb-6 p-3 bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <div className="flex flex-col gap-1 flex-shrink-0">
          <label className="text-xs text-gray-500">Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-800" />
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <label className="text-xs text-gray-500">End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-800" />
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <label className="text-xs text-gray-500">Crew</label>
          <select value={crew} onChange={e => setCrew(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-800 w-28">
            <option value="">All crews</option>
            {crews.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <label className="text-xs text-gray-500">Equipment type</label>
          <button
            ref={typeButtonRef}
            onClick={openTypeDropdown}
            className="flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-800 bg-white w-44 hover:bg-gray-50"
          >
            <span className="truncate">
              {selectedTypes.size === 0 ? "All types" : `${selectedTypes.size} type${selectedTypes.size !== 1 ? "s" : ""}`}
            </span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className={`flex-shrink-0 text-gray-400 transition-transform ${typeDropdownOpen ? "rotate-180" : ""}`}>
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {typeDropdownOpen && typeDropdownPos && createPortal(
            <div
              ref={typePanelRef}
              className="fixed w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-[60] py-1 max-h-72 overflow-y-auto"
              style={{ top: typeDropdownPos.top, left: typeDropdownPos.left }}
            >
              {equipTypes.map(t => (
                <label key={t} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedTypes.has(t)} onChange={() => toggleType(t)} className="rounded border-gray-300" />
                  <span className="text-gray-700">{t}</span>
                </label>
              ))}
            </div>,
            document.body
          )}
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          <label className="text-xs text-gray-500">&nbsp;</label>
          <button
            onClick={toggleOnSite}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium border transition-colors flex-shrink-0
              ${onSiteOnly ? "bg-green-50 border-green-300 text-green-800" : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${onSiteOnly ? "bg-green-500" : "bg-gray-300"}`} />
            On-site
          </button>
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          <label className="text-xs text-gray-500">Function code</label>
          <button
            ref={functionButtonRef}
            onClick={openFunctionDropdown}
            className="flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-800 bg-white w-44 hover:bg-gray-50"
          >
            <span className="truncate">
              {selectedFunctions.size === 0 ? "All functions" : `${selectedFunctions.size} selected`}
            </span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className={`flex-shrink-0 text-gray-400 transition-transform ${functionDropdownOpen ? "rotate-180" : ""}`}>
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {functionDropdownOpen && functionDropdownPos && createPortal(
            <div
              ref={functionPanelRef}
              className="fixed w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-[60] py-1 max-h-72 overflow-y-auto"
              style={{ top: functionDropdownPos.top, left: functionDropdownPos.left }}
            >
              {functionOptions.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">No function codes found</div>
              )}
              {functionOptions.map(f => (
                <label key={f} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedFunctions.has(f)} onChange={() => toggleFunction(f)} className="rounded border-gray-300 flex-shrink-0" />
                  <span className="text-gray-700 truncate">{f}</span>
                </label>
              ))}
            </div>,
            document.body
          )}
        </div>

        <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

        {([3, 6, 9, 12] as number[]).map(m => (
          <button
            key={m}
            onClick={() => applyQuickRange(m)}
            className="flex-shrink-0 border border-gray-300 bg-white text-gray-700 px-2.5 py-1.5 rounded-lg text-sm hover:bg-gray-50"
          >
            {m}mo
          </button>
        ))}
        <button
          onClick={() => applyQuickRange("ytd")}
          className="flex-shrink-0 border border-gray-300 bg-white text-gray-700 px-2.5 py-1.5 rounded-lg text-sm hover:bg-gray-50"
        >
          YTD
        </button>

        <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

        <button onClick={() => applyFilters(rawData, startDate, endDate, crew, selectedTypes, onSiteOnly, selectedFunctions)} className="flex-shrink-0 bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-sm hover:bg-blue-700">Apply</button>
        <button onClick={() => {
          setStartDate(""); setEndDate(""); setCrew(""); setSelectedTypes(new Set()); setOnSiteOnly(false); setSelectedFunctions(new Set())
            applyFilters(rawData, "", "", "", new Set(), false, new Set())
          }} className="flex-shrink-0 border border-gray-800 bg-gray-600 text-white px-3.5 py-1.5 rounded-lg text-sm hover:bg-gray-800">Reset</button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          ["Selected vehicles", totalVehicles],
          ["Total miles", totalMiles.toFixed(0)],
          ["Total hours", totalHours.toFixed(1)],
          ["Active days", totalDays],
        ].map(([l, v]) => (
          <div key={String(l)} className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-600 mb-1">{l}</div>
            <div className="text-2xl font-medium text-gray-900">{v}</div>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("charts")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "charts" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Charts
        </button>
        <button
          onClick={() => setTab("calendar")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "calendar" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Calendar
        </button>
      </div>

      {/* Charts tab */}
      {tab === "charts" && (
        <>
          <EquipmentBarCharts
            active={active}
            fnLegend={fnLegend}
            setFnLegend={setFnLegend}
          />
          <EquipmentTable
            allRows={allRows}
            selectedEquip={selectedEquip}
            onToggle={toggleEquip}
            onToggleAll={toggleAll}
          />
        </>
      )}

      {/* Calendar tab */}
      {tab === "calendar" && (
        <EquipmentCalendar allRows={allRows} active={active} focusDate={calendarFocusDate} />
      )}
    </div>
  )
}
