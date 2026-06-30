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

function useDoughnut(
  ref: React.RefObject<HTMLDivElement | null>,
  data: { label: string; value: number }[],
  colors: string[],
  setLegend?: (items: { label: string; value: number; color: string; pct: number }[]) => void
) {
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
    const arcs = pie(data)

    g.selectAll("path")
      .data(arcs)
      .join("path")
      .attr("d", arc)
      .attr("fill", (_, i) => colors[i % colors.length])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)

    if (setLegend) {
      setLegend(data.map((d, i) => ({
        label: d.label,
        value: d.value,
        color: colors[i % colors.length],
        pct: Math.round(d.value / total * 100),
      })))
    }
  }, [data, colors])
}

function useVerticalBar(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  rows: EmpRow[],
  selected: Set<string>,
  setBarLegend: (items: { key: string; color: string }[]) => void
) {
  useEffect(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    container.innerHTML = ""

    const active = rows
      .filter(r => selected.has(r.name))
      .sort((a, b) => b.reg - a.reg)
    if (!active.length) return

    const leaveTypes = [...new Set(active.flatMap(r => [...r.leaveTypes]))]
    const keys = ["Regular", ...leaveTypes]
    const colorMap: Record<string, string> = { Regular: COLORS.regular }
    leaveTypes.forEach((lt, i) => { colorMap[lt] = COLORS.leave[i % COLORS.leave.length] })

    const stackData = active.map(r => {
      const lm: Record<string, number> = {}
      r.rawRows.forEach((d: any) => {
        const lt = (d["Leave Description"] || "").trim()
        if (lt) lm[lt] = (lm[lt] || 0) + (Number(d["Leave Hours"]) || 0)
      })
      return { name: r.name, Regular: r.reg, ...lm }
    })

    const margin = { top: 16, right: 16, bottom: 72, left: 52 }
    const chartH = 300
    const colW = 52          // px per employee column
    const chartW = Math.max(active.length * colW, 400)
    const totalW = chartW + margin.left + margin.right
    const totalH = chartH + margin.top + margin.bottom

    const maxVal = d3.max(stackData, d => keys.reduce((s, k) => s + ((d as any)[k] || 0), 0)) || 1

    // ── Y-axis overlay (fixed, not scrollable) ──────────────────────────
    const yAxisW = margin.left
    const yAxisSvg = d3.create("svg")
      .attr("width", yAxisW)
      .attr("height", totalH)
      .style("flex-shrink", "0")
      .style("position", "sticky")
      .style("left", "0")
      .style("z-index", "10")
      .style("background", "#fff")

    const yScale = d3.scaleLinear().domain([0, maxVal]).nice().range([chartH, 0])

    yAxisSvg.append("g")
      .attr("transform", `translate(${yAxisW - 1},${margin.top})`)
      .call(d3.axisLeft(yScale).ticks(5).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text").attr("font-size", 11).attr("fill", "#374151").attr("dx", -4))

    // ── Scrollable bars SVG ─────────────────────────────────────────────
    const barSvg = d3.create("svg")
      .attr("width", totalW)
      .attr("height", totalH)

    const g = barSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // Gridlines
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartW))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line").attr("stroke", "#e5e7eb"))
      .call(ax => ax.selectAll("text").remove())

    const xScale = d3.scaleBand()
      .domain(active.map(r => r.name))
      .range([0, chartW])
      .padding(0.3)

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
      .attr("x", (_, i) => xScale(active[i].name)!)
      .attr("y", d => yScale(d[1]))
      .attr("height", d => yScale(d[0]) - yScale(d[1]))
      .attr("width", xScale.bandwidth())
      .attr("rx", 2)

    // X-axis labels — rotated employee names
    g.append("g")
      .attr("transform", `translate(0,${chartH})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text")
        .attr("font-size", 10)
        .attr("fill", "#111827")
        .attr("text-anchor", "end")
        .attr("transform", "rotate(-40)")
        .attr("dy", "0.35em")
        .attr("dx", "-0.5em"))

    // ── Assemble layout ─────────────────────────────────────────────────
    // Outer wrapper: flex row so Y-axis sticks to left
    const wrapper = document.createElement("div")
    wrapper.style.cssText = "display:flex;align-items:flex-start;width:100%;"

    // Y-axis node
    wrapper.appendChild(yAxisSvg.node()!)

    // Scrollable bar area
    const scrollArea = document.createElement("div")
    scrollArea.style.cssText = "overflow-x:auto;flex:1;"
    scrollArea.appendChild(barSvg.node()!)
    wrapper.appendChild(scrollArea)

    container.appendChild(wrapper)

    setBarLegend(keys.map(k => ({ key: k, color: colorMap[k] || "#ccc" })))
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
  const [pieLegend, setPieLegend] = useState<{ label: string; value: number; color: string; pct: number }[]>([])
  const [leaveLegend, setLeaveLegend] = useState<{ label: string; value: number; color: string; pct: number }[]>([])
  const [barLegend, setBarLegend] = useState<{ key: string; color: string }[]>([])

  const pieRef = useRef<HTMLDivElement>(null)
  const leaveRef = useRef<HTMLDivElement>(null)
  const barContainerRef = useRef<HTMLDivElement>(null)

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

  useDoughnut(pieRef, pieData, [COLORS.regular, COLORS.ot, COLORS.leave[0]], setPieLegend)
  useDoughnut(leaveRef, leaveData.length ? leaveData : [{ label: "No leave", value: 1 }], leaveData.length ? COLORS.leave : ["#B4B2A9"], setLeaveLegend)
  useVerticalBar(barContainerRef, allRows, selectedEmps, setBarLegend)

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
        <h1 className="text-2xl font-medium">Equipment Dashboard</h1>
        <button
          onClick={() => router.push("/upload")}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
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
          <button onClick={() => { setStartDate(""); setEndDate(""); setCrew(""); applyFilters(rawData, "", "", "") }} className="border border-gray-800 bg-gray-600 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-800">Reset</button>
        </div>
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

      {/* Doughnut charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-medium text-bold text-gray-800 mb-3">Hours Breakdown</div>
          <div ref={pieRef} className="w-full" />
          <div className="flex flex-col gap-y-2 mt-3">
            {[...pieLegend].sort((a, b) => b.pct - a.pct).map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-gray-800 flex-1 font-medium">{item.label}</span>
                <span className="text-xs text-gray-600 flex-shrink-0">{item.value.toFixed(1)} hrs</span>
                <span className="text-xs font-semibold text-gray-800 flex-shrink-0 w-9 text-right">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-800 mb-3">Leave hours by type</div>
          <div ref={leaveRef} className="w-full" />
          <div className="flex flex-col gap-y-2 mt-3 max-h-40 overflow-y-auto pr-1">
            {[...leaveLegend].sort((a, b) => b.pct - a.pct).map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-gray-800 flex-1 font-medium">{item.label}</span>
                <span className="text-xs text-gray-600 flex-shrink-0">{item.value.toFixed(1)} hrs</span>
                <span className="text-xs font-semibold text-gray-800 flex-shrink-0 w-9 text-right">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vertical stacked bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium text-gray-800 mb-3">Hours per Employee</div>
        <div ref={barContainerRef} className="w-full" />
        {barLegend.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 pt-3 border-t border-gray-100">
            {barLegend.map(item => (
              <div key={item.key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs font-medium text-gray-800">{item.key}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium text-gray-800 mb-3">Employee Summary</div>
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
                  {["Employee","Crew","Regular hrs","OT hrs","Leave type","Leave hrs","Total hrs"].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs text-gray-600 font-semibold bg-white">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map(r => (
                  <tr key={r.name} className={`border-b border-gray-100 hover:bg-gray-50 transition-opacity ${selectedEmps.has(r.name) ? "opacity-100" : "opacity-40"}`}>
                    <td className="py-2 px-3">
                      <input type="checkbox" checked={selectedEmps.has(r.name)} onChange={e => toggleEmp(r.name, e.target.checked)} className="cursor-pointer" aria-label={`Select ${r.name}`} />
                    </td>
                    <td className="py-2 px-3" style={{ color: "#111827" }}>{r.name}</td>
                    <td className="py-2 px-3" style={{ color: "#374151" }}>{r.crew}</td>
                    <td className="py-2 px-3" style={{ color: "#111827" }}>{r.reg.toFixed(1)}</td>
                    <td className="py-2 px-3" style={{ color: "#111827" }}>{r.ot.toFixed(1)}</td>
                    <td className="py-2 px-3" style={{ color: "#374151" }}>{[...r.leaveTypes].join(", ") || "—"}</td>
                    <td className="py-2 px-3" style={{ color: "#111827" }}>{r.leaveHrs.toFixed(1)}</td>
                    <td className="py-2 px-3 font-semibold" style={{ color: "#111827" }}>{(r.reg + r.ot + r.leaveHrs).toFixed(1)}</td>
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
