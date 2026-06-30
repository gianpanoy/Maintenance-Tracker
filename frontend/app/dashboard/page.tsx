"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import * as d3 from "d3"
import axios from "axios"

const COLORS = {
  regular: "#378ADD",
  ot: "#1D9E75",
  leave: ["#D85A30","#D4537E","#BA7517","#7F77DD","#639922","#E24B4A","#5DCAA5","#EF9F27"],
}

interface EmpRow {
  name: string
  crew: string
  reg: number
  ot: number
  leaveHrs: number
  leaveTypes: Set<string>
  rawRows: any[]
}

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

function useDoughnut(ref: React.RefObject<HTMLDivElement | null>, data: { label: string; value: number }[], colors: string[]) {
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const w = el.clientWidth || 260
    const h = 220
    const r = Math.min(w, h) / 2 - 10
    const svg = d3.select(el).append("svg").attr("width", w).attr("height", h)
    const g = svg.append("g").attr("transform", `translate(${w / 2},${h / 2 - 10})`)

    const total = d3.sum(data, d => d.value) || 1
    const pie = d3.pie<{ label: string; value: number }>().value(d => d.value).sort(null)
    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>().innerRadius(r * 0.55).outerRadius(r)
    const arcs = pie(data)

    g.selectAll("path")
      .data(arcs)
      .join("path")
      .attr("d", arc)
      .attr("fill", (_, i) => colors[i % colors.length])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)

    const legend = svg.append("g").attr("transform", `translate(0,${h - 28})`)
    data.forEach((d, i) => {
      const x = (w / data.length) * i
      legend.append("rect").attr("x", x).attr("y", 0).attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", colors[i % colors.length])
      legend.append("text").attr("x", x + 14).attr("y", 9).attr("font-size", 10).attr("fill", "#888").text(`${d.label} ${Math.round(d.value / total * 100)}%`)
    })
  }, [data, colors])
}

function useStackedBar(ref: React.RefObject<HTMLDivElement | null>, rows: EmpRow[], selected: Set<string>) {
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const active = rows.filter(r => selected.has(r.name))
    if (!active.length) return

    const leaveTypes = [...new Set(active.flatMap(r => [...r.leaveTypes]))]
    const keys = ["Regular", ...leaveTypes]
    const stackData = active.map(r => {
      const leaveMap: Record<string, number> = {}
      r.rawRows.forEach((d: any) => {
        const lt = (d["Leave Description"] || "").trim()
        if (lt) leaveMap[lt] = (leaveMap[lt] || 0) + (Number(d["Leave Hours"]) || 0)
      })
      return { name: r.name, Regular: r.reg, ...leaveMap }
    })

    const margin = { top: 10, right: 20, bottom: 20, left: 110 }
    const w = (el.clientWidth || 600) - margin.left - margin.right
    const rowH = 40
    const h = active.length * rowH

    const svg = d3.select(el)
      .append("svg")
      .attr("width", w + margin.left + margin.right)
      .attr("height", h + margin.top + margin.bottom)

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear()
      .domain([0, d3.max(stackData, d => keys.reduce((s, k) => s + ((d as any)[k] || 0), 0)) || 1])
      .range([0, w])

    const y = d3.scaleBand()
      .domain(active.map(r => r.name))
      .range([0, h])
      .padding(0.3)

    const colorMap: Record<string, string> = { Regular: COLORS.regular }
    leaveTypes.forEach((lt, i) => colorMap[lt] = COLORS.leave[i % COLORS.leave.length])

    const stack = d3.stack<any>().keys(keys).value((d, k) => (d as any)[k] || 0)
    const series = stack(stackData)

    g.selectAll("g.layer")
      .data(series)
      .join("g")
      .attr("class", "layer")
      .attr("fill", d => colorMap[d.key] || "#ccc")
      .selectAll("rect")
      .data(d => d)
      .join("rect")
      .attr("y", (_, i) => y(active[i].name)!)
      .attr("x", d => x(d[0]))
      .attr("width", d => x(d[1]) - x(d[0]))
      .attr("height", y.bandwidth())

    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-h))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick line").attr("stroke", "#eee"))
      .call(ax => ax.selectAll(".tick text").attr("font-size", 11).attr("fill", "#888"))

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text").attr("font-size", 11).attr("fill", "#555").attr("dx", -6))

    const legend = svg.append("g").attr("transform", `translate(${margin.left},${h + margin.top + margin.bottom - 4})`)
    keys.forEach((k, i) => {
      const lx = i * 110
      legend.append("rect").attr("x", lx).attr("y", 0).attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", colorMap[k])
      legend.append("text").attr("x", lx + 14).attr("y", 9).attr("font-size", 10).attr("fill", "#888").text(k)
    })
  }, [rows, selected])
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

  const pieRef = useRef<HTMLDivElement>(null)
  const leaveRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const active = allRows.filter(r => selectedEmps.has(r.name))
  const totalReg = active.reduce((s, r) => s + r.reg, 0)
  const totalOT = active.reduce((s, r) => s + r.ot, 0)
  const totalLeave = active.reduce((s, r) => s + r.leaveHrs, 0)

  const leaveMap: Record<string, number> = {}
  active.forEach(r => {
    r.rawRows.forEach((d: any) => {
      const lt = (d["Leave Description"] || "").trim()
      if (lt) leaveMap[lt] = (leaveMap[lt] || 0) + (Number(d["Leave Hours"]) || 0)
    })
  })

  const pieData = [
    { label: "Regular", value: totalReg },
    { label: "OT", value: totalOT },
    { label: "Leave", value: totalLeave },
  ]
  const leaveData = Object.entries(leaveMap).map(([label, value]) => ({ label, value }))

  useDoughnut(pieRef, pieData, [COLORS.regular, COLORS.ot, COLORS.leave[0]])
  useDoughnut(leaveRef, leaveData.length ? leaveData : [{ label: "No leave", value: 1 }], leaveData.length ? COLORS.leave : ["#B4B2A9"])
  useStackedBar(barRef, allRows, selectedEmps)

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

  const allChecked = selectedEmps.size === allRows.length
  const someChecked = selectedEmps.size > 0 && !allChecked

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium">Dashboard</h1>
        <button onClick={() => router.push("/upload")} className="text-sm text-blue-600 hover:underline">Upload new file</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-white border border-gray-200 rounded-xl">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Crew</label>
          <select value={crew} onChange={e => setCrew(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">All crews</option>
            {crews.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={() => applyFilters(rawData, startDate, endDate, crew)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">Apply</button>
          <button onClick={() => { setStartDate(""); setEndDate(""); setCrew(""); applyFilters(rawData, "", "", "") }} className="border border-gray-300 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50">Reset</button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[["Selected employees", active.length], ["Regular hrs", totalReg.toFixed(1)], ["OT hrs", totalOT.toFixed(1)], ["Leave hrs", totalLeave.toFixed(1)]].map(([l, v]) => (
          <div key={String(l)} className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{l}</div>
            <div className="text-2xl font-medium">{v}</div>
          </div>
        ))}
      </div>

      {/* Doughnut charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500 mb-3">Hours breakdown</div>
          <div ref={pieRef} className="w-full" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500 mb-3">Leave hours by type</div>
          <div ref={leaveRef} className="w-full" />
        </div>
      </div>

      {/* Stacked bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm text-gray-500 mb-3">Regular & leave hours per employee</div>
        <div ref={barRef} className="w-full" />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-500">Employee summary</div>
          <div className="text-xs text-gray-400">Check/uncheck to include in charts</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-2 px-3 w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked }}
                  onChange={e => toggleAll(e.target.checked)}
                  aria-label="Select all"
                  className="cursor-pointer"
                />
              </th>
              {["Employee","Crew","Regular hrs","OT hrs","Leave type","Leave hrs","Total hrs"].map(h => (
                <th key={h} className="text-left py-2 px-3 text-xs text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map(r => (
              <tr key={r.name} className={`border-b border-gray-50 hover:bg-gray-50 transition-opacity ${selectedEmps.has(r.name) ? "opacity-100" : "opacity-40"}`}>
                <td className="py-2 px-3">
                  <input type="checkbox" checked={selectedEmps.has(r.name)} onChange={e => toggleEmp(r.name, e.target.checked)} className="cursor-pointer" aria-label={`Select ${r.name}`} />
                </td>
                <td className="py-2 px-3">{r.name}</td>
                <td className="py-2 px-3">{r.crew}</td>
                <td className="py-2 px-3">{r.reg.toFixed(1)}</td>
                <td className="py-2 px-3">{r.ot.toFixed(1)}</td>
                <td className="py-2 px-3">{[...r.leaveTypes].join(", ") || "—"}</td>
                <td className="py-2 px-3">{r.leaveHrs.toFixed(1)}</td>
                <td className="py-2 px-3 font-medium">{(r.reg + r.ot + r.leaveHrs).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
