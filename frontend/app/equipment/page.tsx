"use client"
import { useEffect, useRef, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import * as d3 from "d3"
import axios from "axios"

const COLORS = {
  miles: "#378ADD",
  hours: "#1D9E75",
  fn: ["#378ADD","#1D9E75","#D85A30","#D4537E","#BA7517","#7F77DD","#639922","#E24B4A","#5DCAA5","#EF9F27"],
}

export interface EquipRow {
  code: string
  year: string
  desc: string
  crew: string
  totalMiles: number
  totalHours: number
  daysUsed: Set<string>
  functions: Record<string, number>
  operators: Set<string>
  rawRows: any[]
}

function buildRows(data: any[]): EquipRow[] {
  const map: Record<string, EquipRow> = {}
  data.forEach((r: any) => {
    const fleet = String(r["Fleet Code"] || "").trim()
    const unit = String(r["Unit Number"] || "").trim()
    // 4th digit of fleet code + 3-digit unit number = equipment ID (e.g. 98842 + 182 = 4182)
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

type LegendItem = { label: string; value: number; color: string; pct: number }

function useDoughnut(
  ref: React.RefObject<HTMLDivElement | null>,
  data: { label: string; value: number }[],
  colors: string[],
  onLegend: (items: LegendItem[]) => void
) {
  const onLegendRef = useRef(onLegend)
  useEffect(() => { onLegendRef.current = onLegend })

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
    const w = el.clientWidth || 260
    const h = 200
    const r = Math.min(w, h) / 2 - 8
    const svg = d3.select(el).append("svg").attr("width", w).attr("height", h)
    const g = svg.append("g").attr("transform", `translate(${w / 2},${h / 2})`)
    const total = d3.sum(data, d => d.value) || 1
    const pie = d3.pie<{ label: string; value: number }>().value(d => d.value).sort(null)
    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>().innerRadius(r * 0.55).outerRadius(r)
    g.selectAll("path").data(pie(data)).join("path")
      .attr("d", arc)
      .attr("fill", (_, i) => colors[i % colors.length])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
    onLegendRef.current(data.map((d, i) => ({
      label: d.label, value: d.value,
      color: colors[i % colors.length],
      pct: Math.round(d.value / total * 100),
    })))
  }, [data, colors])
}

function useMilesBar(
  ref: React.RefObject<HTMLDivElement | null>,
  rows: EquipRow[],
  selected: Set<string>
) {
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
    const active = rows.filter(r => selected.has(r.code)).sort((a, b) => b.totalMiles - a.totalMiles)
    if (!active.length) return

    const margin = { top: 10, right: 20, bottom: 20, left: 180 }
    const rowH = 36
    const w = (el.clientWidth || 600) - margin.left - margin.right
    const h = active.length * rowH

    const svg = d3.select(el)
      .append("svg")
      .attr("width", w + margin.left + margin.right)
      .attr("height", h + margin.top + margin.bottom)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, d3.max(active, d => d.totalMiles) || 1]).range([0, w])
    const y = d3.scaleBand().domain(active.map(r => r.code)).range([0, h]).padding(0.3)

    g.selectAll("rect.miles")
      .data(active).join("rect")
      .attr("class", "miles")
      .attr("y", d => y(d.code)!)
      .attr("x", 0)
      .attr("width", d => x(d.totalMiles))
      .attr("height", y.bandwidth())
      .attr("fill", COLORS.miles)
      .attr("rx", 2)

    g.append("g")
      .call(d3.axisBottom(x).ticks(5).tickSize(-h))
      .attr("transform", `translate(0,${h})`)
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line").attr("stroke", "#e5e7eb"))
      .call(ax => ax.selectAll("text").attr("font-size", 11).attr("fill", "#888"))

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text")
        .attr("font-size", 11).attr("fill", "#374151").attr("dx", -6)
        .text((d: any) => {
          const row = active.find(r => r.code === d)
          const label = row ? `${d} — ${row.desc.slice(0, 16)}` : String(d)
          return label.length > 24 ? label.slice(0, 24) + "…" : label
        })
      )
  }, [rows, selected])
}

function useHoursBar(
  ref: React.RefObject<HTMLDivElement | null>,
  rows: EquipRow[],
  selected: Set<string>
) {
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
    const active = rows.filter(r => selected.has(r.code)).sort((a, b) => b.totalHours - a.totalHours)
    if (!active.length) return

    const margin = { top: 10, right: 20, bottom: 20, left: 180 }
    const rowH = 36
    const w = (el.clientWidth || 600) - margin.left - margin.right
    const h = active.length * rowH

    const svg = d3.select(el)
      .append("svg")
      .attr("width", w + margin.left + margin.right)
      .attr("height", h + margin.top + margin.bottom)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, d3.max(active, d => d.totalHours) || 1]).range([0, w])
    const y = d3.scaleBand().domain(active.map(r => r.code)).range([0, h]).padding(0.3)

    g.selectAll("rect.hours")
      .data(active).join("rect")
      .attr("class", "hours")
      .attr("y", d => y(d.code)!)
      .attr("x", 0)
      .attr("width", d => x(d.totalHours))
      .attr("height", y.bandwidth())
      .attr("fill", COLORS.hours)
      .attr("rx", 2)

    g.append("g")
      .call(d3.axisBottom(x).ticks(5).tickSize(-h))
      .attr("transform", `translate(0,${h})`)
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line").attr("stroke", "#e5e7eb"))
      .call(ax => ax.selectAll("text").attr("font-size", 11).attr("fill", "#888"))

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text")
        .attr("font-size", 11).attr("fill", "#374151").attr("dx", -6)
        .text((d: any) => {
          const row = active.find(r => r.code === d)
          const label = row ? `${d} — ${row.desc.slice(0, 16)}` : String(d)
          return label.length > 24 ? label.slice(0, 24) + "…" : label
        })
      )
  }, [rows, selected])
}

function useFunctionBar(
  ref: React.RefObject<HTMLDivElement | null>,
  rows: EquipRow[],
  selected: Set<string>,
  onLegend: (items: LegendItem[]) => void
) {
  const onLegendRef = useRef(onLegend)
  useEffect(() => { onLegendRef.current = onLegend })

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
    const active = rows.filter(r => selected.has(r.code))
    if (!active.length) return

    const fnMap: Record<string, number> = {}
    active.forEach(r => {
      Object.entries(r.functions).forEach(([fn, miles]) => {
        fnMap[fn] = (fnMap[fn] || 0) + miles
      })
    })

    const fnData = Object.entries(fnMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    const total = d3.sum(fnData, d => d.value) || 1
    onLegendRef.current(fnData.map((d, i) => ({
      label: d.label, value: d.value,
      color: COLORS.fn[i % COLORS.fn.length],
      pct: Math.round(d.value / total * 100),
    })))

    const margin = { top: 10, right: 16, bottom: 80, left: 48 }
    const w = (el.clientWidth || 500) - margin.left - margin.right
    const h = 220

    const svg = d3.select(el)
      .append("svg")
      .attr("width", w + margin.left + margin.right)
      .attr("height", h + margin.top + margin.bottom)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const x = d3.scaleBand().domain(fnData.map(d => d.label)).range([0, w]).padding(0.3)
    const y = d3.scaleLinear().domain([0, d3.max(fnData, d => d.value) || 1]).nice().range([h, 0])

    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickSize(-w))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line").attr("stroke", "#e5e7eb"))
      .call(ax => ax.selectAll("text").attr("font-size", 11).attr("fill", "#888"))

    g.selectAll("rect").data(fnData).join("rect")
      .attr("x", d => x(d.label)!)
      .attr("y", d => y(d.value))
      .attr("width", x.bandwidth())
      .attr("height", d => h - y(d.value))
      .attr("fill", (_, i) => COLORS.fn[i % COLORS.fn.length])
      .attr("rx", 2)

    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text")
        .attr("font-size", 10).attr("fill", "#374151")
        .attr("text-anchor", "end").attr("transform", "rotate(-35)")
        .attr("dy", "0.35em").attr("dx", "-0.5em")
        .text((d: any) => d.length > 20 ? d.slice(0, 20) + "…" : d)
      )
  }, [rows, selected])
}

const MILES_COLORS = [COLORS.miles]
const HOURS_COLORS = [COLORS.hours]

export default function EquipmentDashboard() {
  const router = useRouter()
  const [rawData, setRawData] = useState<any[]>([])
  const [allRows, setAllRows] = useState<EquipRow[]>([])
  const [selectedEquip, setSelectedEquip] = useState<Set<string>>(new Set())
  const [crews, setCrews] = useState<string[]>([])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [crew, setCrew] = useState("")
  const [milesLegend, setMilesLegend] = useState<LegendItem[]>([])
  const [hoursLegend, setHoursLegend] = useState<LegendItem[]>([])
  const [fnLegend, setFnLegend] = useState<LegendItem[]>([])

  const milesDonutRef = useRef<HTMLDivElement>(null)
  const hoursDonutRef = useRef<HTMLDivElement>(null)
  const milesBarRef = useRef<HTMLDivElement>(null)
  const hoursBarRef = useRef<HTMLDivElement>(null)
  const fnBarRef = useRef<HTMLDivElement>(null)

  const active = allRows.filter(r => selectedEquip.has(r.code))
  const totalMiles = active.reduce((s, r) => s + r.totalMiles, 0)
  const totalHours = active.reduce((s, r) => s + r.totalHours, 0)
  const totalDays = new Set(active.flatMap(r => [...r.daysUsed])).size
  const totalVehicles = active.length

  const milesDonutData = useMemo(() => [
    { label: "Total Miles", value: totalMiles },
  ], [totalMiles])

  const hoursDonutData = useMemo(() => [
    { label: "Total Hours", value: totalHours },
  ], [totalHours])

  useDoughnut(milesDonutRef, milesDonutData, MILES_COLORS, setMilesLegend)
  useDoughnut(hoursDonutRef, hoursDonutData, HOURS_COLORS, setHoursLegend)
  useMilesBar(milesBarRef, allRows, selectedEquip)
  useHoursBar(hoursBarRef, allRows, selectedEquip)
  useFunctionBar(fnBarRef, allRows, selectedEquip, setFnLegend)

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

  const allChecked = selectedEquip.size === allRows.length
  const someChecked = selectedEquip.size > 0 && !allChecked

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

      {/* Miles bar + Hours bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-800 mb-3">Miles per Vehicle</div>
          <div ref={milesBarRef} className="w-full" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-800 mb-3">Hours per Vehicle</div>
          <div ref={hoursBarRef} className="w-full" />
        </div>
      </div>

      {/* Miles by function */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium text-gray-800 mb-3">Miles by Work Type</div>
        <div ref={fnBarRef} className="w-full" />
        <div className="flex flex-col gap-y-2 mt-3 max-h-40 overflow-y-auto pr-1">
          {[...fnLegend].sort((a, b) => b.pct - a.pct).map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-gray-800 flex-1 font-medium">{item.label}</span>
              <span className="text-xs text-gray-600 flex-shrink-0">{item.value.toFixed(0)} mi</span>
              <span className="text-xs font-semibold text-gray-800 flex-shrink-0 w-9 text-right">{item.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Equipment table */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium text-gray-800 mb-3">Equipment Summary</div>
        <div className="overflow-x-auto">
          <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="py-2 px-3 w-10 bg-white">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked }}
                      onChange={e => toggleAll(e.target.checked)}
                      aria-label="Select all"
                      className="cursor-pointer"
                    />
                  </th>
                  {["Code","Year","Description","Crew","Total Miles","Total Hours","Days Used","Operators"].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs text-gray-600 font-semibold bg-white">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map(r => (
                  <tr key={r.code} className={`border-b border-gray-100 hover:bg-gray-50 transition-opacity ${selectedEquip.has(r.code) ? "opacity-100" : "opacity-40"}`}>
                    <td className="py-2 px-3">
                      <input type="checkbox" checked={selectedEquip.has(r.code)} onChange={e => toggleEquip(r.code, e.target.checked)} className="cursor-pointer" aria-label={`Select ${r.code}`} />
                    </td>
                    <td className="py-2 px-3 font-medium text-gray-900">{r.code}</td>
                    <td className="py-2 px-3 text-gray-700">{r.year}</td>
                    <td className="py-2 px-3 text-gray-700 max-w-[200px] truncate" title={r.desc}>{r.desc}</td>
                    <td className="py-2 px-3 text-gray-700">{r.crew}</td>
                    <td className="py-2 px-3 font-semibold text-gray-900">{r.totalMiles.toFixed(0)}</td>
                    <td className="py-2 px-3 font-semibold text-gray-900">{r.totalHours.toFixed(1)}</td>
                    <td className="py-2 px-3 text-gray-700">{r.daysUsed.size}</td>
                    <td className="py-2 px-3 text-gray-500 text-xs max-w-[160px] truncate" title={[...r.operators].join(", ")}>{[...r.operators].join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
