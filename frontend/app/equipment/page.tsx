"use client"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { EquipRow } from "@/components/EquipRow"
import EquipmentBarCharts from "@/components/EquipmentBarCharts"
import EquipmentTable from "@/components/EquipmentTable"

type LegendItem = { label: string; value: number; color: string; pct: number }

function buildRows(data: any[]): EquipRow[] {
  const map: Record<string, EquipRow> = {}
  data.forEach((r: any) => {
    const fleet = String(r["Fleet Code"] || "").trim()
    const unit = String(r["Unit Number"] || "").trim()
    const fleetDigit = fleet.length >= 4 ? fleet[3] : ""
    const equipId = fleetDigit && unit ? `${fleetDigit}${unit}` : unit || "Unknown"

    if (!map[equipId]) map[equipId] = {
      code: equipId,
      year: String(r["Equipment Year"] || "").trim(),
      desc: String(r["Equipment Description"] || "").trim(),
      crew: String(r["Crew Code"] || "").trim(),
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
  const [fnLegend, setFnLegend] = useState<LegendItem[]>([])

  // useMemo so active is a stable reference — only recalculates when allRows or selectedEquip change
  const active = useMemo(
    () => allRows.filter(r => selectedEquip.has(r.code)),
    [allRows, selectedEquip]
  )

  const totalMiles = useMemo(() => active.reduce((s, r) => s + r.totalMiles, 0), [active])
  const totalHours = useMemo(() => active.reduce((s, r) => s + r.totalHours, 0), [active])
  const totalDays = useMemo(() => new Set(active.flatMap(r => [...r.daysUsed])).size, [active])
  const totalVehicles = active.length

  function applyFilters(data: any[], s: string, e: string, c: string) {
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
    setAllRows(rows)
    setSelectedEquip(new Set(rows.map(r => r.code)))
  }

  useEffect(() => {
    const session_id = localStorage.getItem("equipment_session_id")
    if (!session_id) { router.push("/upload"); return }
    axios.get(`http://localhost:8000/api/session/equipment/${session_id}`)
      .then(res => {
        const data = res.data.raw || []
        setRawData(data)
        setCrews([...new Set<string>(data.map((r: any) => r["Crew Code"]).filter(Boolean))].sort())
        applyFilters(data, "", "", "")
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

      {/* Filters */}
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
        <div className="flex items-end gap-2">
          <button onClick={() => applyFilters(rawData, startDate, endDate, crew)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">Apply</button>
          <button onClick={() => { setStartDate(""); setEndDate(""); setCrew(""); applyFilters(rawData, "", "", "") }} className="border border-gray-800 bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-gray-800">Reset</button>
        </div>
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
    </div>
  )
}
