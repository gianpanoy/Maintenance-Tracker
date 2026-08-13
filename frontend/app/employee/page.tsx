"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { EmployeeDetail, EmpRow } from "@/components/EmployeeDetail"
import HoursDonutCharts from "@/components/HoursDonutCharts"
import HoursBarChart from "@/components/HoursBarChart"
import EmployeeTable from "@/components/EmployeeTable"

function buildRows(data: any[]): EmpRow[] {
  const map: Record<string, EmpRow> = {}
  data.forEach((r: any) => {
    const n = r["Employee Name"] || "Unknown"
    if (!map[n]) map[n] = { name: n, crew: r["Crew Code"] || "", reg: 0, ot: 0, leaveHrs: 0, leaveTypes: new Set(), rawRows: [] }
    map[n].reg += Number(r["Hours, Regular"]) || 0
    map[n].ot += Number(r["Hours, Overtime"]) || 0
    map[n].leaveHrs += Number(r["Leave Hours"]) || 0
    if ((r["Leave Description"] || "").trim()) map[n].leaveTypes.add(r["Leave Description"].trim())
    map[n].rawRows.push(r)
  })
  return Object.values(map)
}

export default function Dashboard() {
  const router = useRouter()
  const [rawData, setRawData] = useState<any[]>([])
  const [allRows, setAllRows] = useState<EmpRow[]>([])
  const [selectedEmps, setSelectedEmps] = useState<Set<string>>(new Set())
  const [crews, setCrews] = useState<string[]>([])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [crew, setCrew] = useState("")
  const [selectedDetail, setSelectedDetail] = useState<EmpRow | null>(null)

  const active = allRows.filter(r => selectedEmps.has(r.name))
  const totalReg = active.reduce((s, r) => s + r.reg, 0)
  const totalOT = active.reduce((s, r) => s + r.ot, 0)
  const totalLeave = active.reduce((s, r) => s + r.leaveHrs, 0)

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
    setSelectedEmps(new Set(rows.map(r => r.name)))
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
    applyFilters(rawData, s, e, crew)
  }

  useEffect(() => {
    const session_id = localStorage.getItem("session_id")
    if (!session_id) { router.push("/upload"); return }
    axios.get(`http://localhost:8000/api/session/${session_id}`)
      .then(res => {
        const data = res.data.raw || []
        setRawData(data)
        setCrews([...new Set<string>(data.map((r: any) => r["Crew Code"]).filter(Boolean))].sort())
        applyFilters(data, "", "", "")
      })
      .catch(() => router.push("/upload"))
  }, [])

  function toggleEmp(name: string, checked: boolean) {
    setSelectedEmps(prev => {
      const next = new Set(prev)
      if (checked) next.add(name)
      else next.delete(name)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelectedEmps(checked ? new Set(allRows.map(r => r.name)) : new Set())
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium">Employee Dashboard</h1>
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
      <div className="flex flex-wrap gap-3 mb-6 p-4 bg-white border border-gray-200 rounded-xl items-end">

        {/* Date inputs */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800" />
        </div>

        {/* Crew */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Crew</label>
          <select value={crew} onChange={e => setCrew(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800">
            <option value="">All crews</option>
            {crews.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-200 mx-1" />

        {/* Quick range buttons */}
        {([3, 6, 9, 12] as number[]).map(m => (
          <button
            key={m}
            onClick={() => applyQuickRange(m)}
            className="border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50"
          >
            {m}mo
          </button>
        ))}
        <button
          onClick={() => applyQuickRange("ytd")}
          className="border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50"
        >
          YTD
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-200 mx-1" />

        {/* Apply / Reset */}
        <button
          onClick={() => applyFilters(rawData, startDate, endDate, crew)}
          className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700"
        >
          Apply
        </button>
        <button
          onClick={() => { setStartDate(""); setEndDate(""); setCrew(""); applyFilters(rawData, "", "", "") }}
          className="border border-gray-800 bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-gray-800"
        >
          Reset
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[["Selected employees", active.length], ["Regular hrs", totalReg.toFixed(1)], ["OT hrs", totalOT.toFixed(1)], ["Leave hrs", totalLeave.toFixed(1)]].map(([l, v]) => (
          <div key={String(l)} className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-600 mb-1">{l}</div>
            <div className="text-2xl font-medium text-gray-900">{v}</div>
          </div>
        ))}
      </div>

      <HoursDonutCharts active={active} />
      <HoursBarChart active={active} />

      <EmployeeTable
        allRows={allRows}
        selectedEmps={selectedEmps}
        onToggle={toggleEmp}
        onToggleAll={toggleAll}
        onSelect={setSelectedDetail}
      />

      <EmployeeDetail emp={selectedDetail} onClose={() => setSelectedDetail(null)} />
    </div>
  )
}
