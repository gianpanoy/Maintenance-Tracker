"use client"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { EquipRow } from "@/components/EquipRow"
import EquipmentBarCharts from "@/components/EquipmentBarCharts"
import EquipmentTable from "@/components/EquipmentTable"
import EquipmentCalendar from "@/components/EquipmentCalendar"
import EquipmentMap from "@/components/EquipmentMap"

type LegendItem = { label: string; value: number; color: string; pct: number }
type Tab = "charts" | "calendar" | "map"

const EQUIP_TYPE_MAP: Record<string, string> = {
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
  "PASSENGER VAN": "Van",
  "VAN": "Van",
  "GUARDRAIL MOWER": "Tractor/Mower",
  "ZERO TURN": "Tractor/Mower",
  "ROTARY": "Tractor/Mower",
  "MOWER": "Tractor/Mower",
  "TRACTOR": "Tractor/Mower",
  "MINI EXCAVATOR": "Compact",
  "TRACKLOADER": "Compact",
  "TRACK LOADER": "Compact",
  "SKIDSTEER": "Compact",
  "SKID STEER": "Compact",
  "COMPACT": "Compact",
  "BACKHOE": "Heavy Equipment",
  "EXCAVATOR": "Heavy Equipment",
  "LOADER": "Heavy Equipment",
  "GRADER": "Heavy Equipment",
  "ROLLER": "Heavy Equipment",
  "CRANE": "Heavy Equipment",
  "LOWBOY": "Trailer",
  "BOAT TRAILER": "Trailer",
  "TRAILER": "Trailer",
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
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [crew, setCrew] = useState("")
  const [equipType, setEquipType] = useState("")
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

  const totalMiles = useMemo(() => active.reduce((s, r) => s + r.totalMiles, 0), [active])
  const totalHours = useMemo(() => active.reduce((s, r) => s + r.totalHours, 0), [active])
  const totalDays = useMemo(() => new Set(active.flatMap(r => [...r.daysUsed])).size, [active])
  const totalVehicles = active.length

  function applyFilters(data: any[], s: string, e: string, c: string, et: string) {
    const sf = s.replace(/-/g, "")
    const ef = e.replace(/-/g, "")
    const filtered = data.filter((r: any) => {
      const d = String(r["Date"] || "")
      if (sf && d < sf) return false
      if (ef && d > ef) return false
      if (c && r["Crew Code"] !== c) return false
      return true
    })
    const rows = buildRows(filtered)
    const finalRows = et ? rows.filter(r => r.equipType === et) : rows
    setAllRows(finalRows)
    setSelectedEquip(new Set(finalRows.map(r => r.code)))
    setCalendarFocusDate(s || e || "")
  }

  useEffect(() => {
    const session_id = localStorage.getItem("equipment_session_id")
    if (!session_id) { router.push("/upload"); return }
    axios.get(`http://localhost:8000/api/session/equipment/${session_id}`)
      .then(res => {
        const data = res.data.raw || []
        setRawData(data)
        setCrews([...new Set<string>(data.map((r: any) => r["Crew Code"]).filter(Boolean))].sort())
        applyFilters(data, "", "", "", "")
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
        <button onClick={() => router.push("/upload")} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          Upload new file
        </button>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-white border border-gray-200 rounded-xl">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Crew</label>
          <select value={crew} onChange={e => setCrew(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800">
            <option value="">All crews</option>
            {crews.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Equipment type</label>
          <select value={equipType} onChange={e => setEquipType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800">
            <option value="">All types</option>
            {equipTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={() => applyFilters(rawData, startDate, endDate, crew, equipType)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">Apply</button>
          <button onClick={() => {
            setStartDate(""); setEndDate(""); setCrew(""); setEquipType("")
            applyFilters(rawData, "", "", "", "")
          }} className="border border-gray-800 bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-gray-800">Reset</button>
        </div>
      </div>

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
        <button
          onClick={() => setTab("map")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "map" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Map
        </button>
      </div>

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

      {tab === "calendar" && (
        <EquipmentCalendar allRows={allRows} active={active} focusDate={calendarFocusDate} />
      )}

      {tab === "map" && (
        <EquipmentMap active={active} />
      )}
    </div>
  )
}
