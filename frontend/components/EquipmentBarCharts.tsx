"use client"
import { useEffect, useRef, memo } from "react"
import * as d3 from "d3"
import { EquipRow } from "@/components/EquipRow"

const COLORS = {
  miles: "#378ADD",
  hours: "#1D9E75",
  fn: ["#378ADD","#1D9E75","#D85A30","#D4537E","#BA7517","#7F77DD","#639922","#E24B4A","#5DCAA5","#EF9F27"],
}

type LegendItem = { label: string; value: number; color: string; pct: number }

function useMilesBar(ref: React.RefObject<HTMLDivElement | null>, active: EquipRow[]) {
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active })

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
    const sorted = [...activeRef.current].sort((a, b) => b.totalMiles - a.totalMiles)
    if (!sorted.length) return

    const margin = { top: 10, right: 20, bottom: 20, left: 180 }
    const rowH = 36
    const w = (el.getBoundingClientRect().width || 600) - margin.left - margin.right
    const h = sorted.length * rowH

    const svg = d3.select(el)
      .append("svg")
      .attr("width", w + margin.left + margin.right)
      .attr("height", h + margin.top + margin.bottom)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, d3.max(sorted, d => d.totalMiles) || 1]).range([0, w])
    const y = d3.scaleBand().domain(sorted.map(r => r.code)).range([0, h]).padding(0.3)

    g.selectAll("rect").data(sorted).join("rect")
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
          const row = sorted.find(r => r.code === d)
          const label = row ? `${d} — ${row.desc.slice(0, 16)}` : String(d)
          return label.length > 24 ? label.slice(0, 24) + "…" : label
        })
      )
  }, [active])
}

function useHoursBar(ref: React.RefObject<HTMLDivElement | null>, active: EquipRow[]) {
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active })

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
    const sorted = [...activeRef.current].sort((a, b) => b.totalHours - a.totalHours)
    if (!sorted.length) return

    const margin = { top: 10, right: 20, bottom: 20, left: 180 }
    const rowH = 36
    const w = (el.getBoundingClientRect().width || 600) - margin.left - margin.right
    const h = sorted.length * rowH

    const svg = d3.select(el)
      .append("svg")
      .attr("width", w + margin.left + margin.right)
      .attr("height", h + margin.top + margin.bottom)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, d3.max(sorted, d => d.totalHours) || 1]).range([0, w])
    const y = d3.scaleBand().domain(sorted.map(r => r.code)).range([0, h]).padding(0.3)

    g.selectAll("rect").data(sorted).join("rect")
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
          const row = sorted.find(r => r.code === d)
          const label = row ? `${d} — ${row.desc.slice(0, 16)}` : String(d)
          return label.length > 24 ? label.slice(0, 24) + "…" : label
        })
      )
  }, [active])
}

function useFunctionBar(
  ref: React.RefObject<HTMLDivElement | null>,
  active: EquipRow[],
  onLegend: (items: LegendItem[]) => void
) {
  const onLegendRef = useRef(onLegend)
  useEffect(() => { onLegendRef.current = onLegend })

  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active })

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
    const current = activeRef.current
    if (!current.length) return

    const fnMap: Record<string, number> = {}
    current.forEach(r => {
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
    const w = (el.getBoundingClientRect().width || 500) - margin.left - margin.right
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
  }, [active])
}

interface Props {
  active: EquipRow[]
  fnLegend: LegendItem[]
  setFnLegend: (items: LegendItem[]) => void
}

// memo prevents re-render unless active actually changes
const EquipmentBarCharts = memo(function EquipmentBarCharts({ active, fnLegend, setFnLegend }: Props) {
  const milesBarRef = useRef<HTMLDivElement>(null)
  const hoursBarRef = useRef<HTMLDivElement>(null)
  const fnBarRef = useRef<HTMLDivElement>(null)
  const barH = active.length * 36 + 30

  useMilesBar(milesBarRef, active)
  useHoursBar(hoursBarRef, active)
  useFunctionBar(fnBarRef, active, setFnLegend)

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-800 mb-3">Miles per Vehicle</div>
          <div ref={milesBarRef} className="w-full" style={{ minHeight: `${barH}px` }} />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-800 mb-3">Hours per Vehicle</div>
          <div ref={hoursBarRef} className="w-full" style={{ minHeight: `${barH}px` }} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium text-gray-800 mb-3">Miles by Work Type</div>
        <div ref={fnBarRef} className="w-full" style={{ minHeight: "320px" }} />
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
    </>
  )
})

export default EquipmentBarCharts
