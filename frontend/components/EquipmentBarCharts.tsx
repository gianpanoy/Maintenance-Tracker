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

function useHorizontalBar(
  ref: React.RefObject<HTMLDivElement | null>,
  rows: EquipRow[],
  valueKey: "totalMiles" | "totalHours",
  color: string,
  unit: string
) {
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
    const sorted = [...rows].sort((a, b) => b[valueKey] - a[valueKey])
    if (!sorted.length) return

    const margin = { top: 10, right: 60, bottom: 20, left: 180 }
    const rowH = 36
    const w = (el.getBoundingClientRect().width || 600) - margin.left - margin.right
    const h = sorted.length * rowH

    const svg = d3.select(el)
      .append("svg")
      .attr("width", w + margin.left + margin.right)
      .attr("height", h + margin.top + margin.bottom)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, d3.max(sorted, d => d[valueKey]) || 1]).range([0, w])
    const y = d3.scaleBand().domain(sorted.map(r => r.code)).range([0, h]).padding(0.3)

    // Gridlines
    g.append("g")
      .call(d3.axisBottom(x).ticks(5).tickSize(-h))
      .attr("transform", `translate(0,${h})`)
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line").attr("stroke", "#e5e7eb"))
      .call(ax => ax.selectAll("text").attr("font-size", 11).attr("fill", "#888"))

    // Bars
    g.selectAll("rect").data(sorted).join("rect")
      .attr("y", d => y(d.code)!)
      .attr("x", 0)
      .attr("width", d => x(d[valueKey]))
      .attr("height", y.bandwidth())
      .attr("fill", color)
      .attr("rx", 2)

    // Value labels at end of bar
    g.selectAll("text.val").data(sorted).join("text")
      .attr("class", "val")
      .attr("x", d => x(d[valueKey]) + 4)
      .attr("y", d => y(d.code)! + y.bandwidth() / 2)
      .attr("dominant-baseline", "middle")
      .attr("font-size", 10)
      .attr("fill", "#6b7280")
      .text(d => `${d[valueKey].toFixed(valueKey === "totalHours" ? 1 : 0)} ${unit}`)

    // Y axis — code + desc
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
  }, [rows, valueKey, color, unit])
}

function useFunctionBar(
  ref: React.RefObject<HTMLDivElement | null>,
  active: EquipRow[],
  onLegend: (items: LegendItem[]) => void
) {
  const onLegendRef = useRef(onLegend)
  useEffect(() => { onLegendRef.current = onLegend })

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()
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

const EquipmentBarCharts = memo(function EquipmentBarCharts({ active, fnLegend, setFnLegend }: Props) {
  const milesBarRef = useRef<HTMLDivElement>(null)
  const hoursBarRef = useRef<HTMLDivElement>(null)
  const fnBarRef = useRef<HTMLDivElement>(null)

  // Split by primary metric
  const milesEquip = active.filter(r => r.totalMiles > 0)
  const hoursEquip = active.filter(r => r.totalHours > 0 && r.totalMiles === 0)
  const milesBarH = milesEquip.length * 36 + 30
  const hoursBarH = hoursEquip.length * 36 + 30

  useHorizontalBar(milesBarRef, milesEquip, "totalMiles", COLORS.miles, "mi")
  useHorizontalBar(hoursBarRef, hoursEquip, "totalHours", COLORS.hours, "hrs")
  useFunctionBar(fnBarRef, active, setFnLegend)

  return (
    <>
      {/* Miles bar — only if any equipment logs miles */}
      {milesEquip.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.miles }} />
            <div className="text-sm font-medium text-gray-800">Miles per Vehicle</div>
            <span className="text-xs text-gray-400 ml-1">({milesEquip.length} vehicles)</span>
          </div>
          <div ref={milesBarRef} className="w-full" style={{ minHeight: `${milesBarH}px` }} />
        </div>
      )}

      {/* Hours bar — only if any equipment logs hours */}
      {hoursEquip.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.hours }} />
            <div className="text-sm font-medium text-gray-800">Hours per Equipment</div>
            <span className="text-xs text-gray-400 ml-1">({hoursEquip.length} units)</span>
          </div>
          <div ref={hoursBarRef} className="w-full" style={{ minHeight: `${hoursBarH}px` }} />
        </div>
      )}

      {/* Miles by work type */}
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
