"use client"
import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { EmpRow } from "@/components/EmployeeDetail"

const COLORS = {
  regular: "#378ADD",
  ot: "#1D9E75",
  leave: ["#D85A30","#D4537E","#BA7517","#7F77DD","#639922","#E24B4A","#5DCAA5","#EF9F27"],
}

function useVerticalBar(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  active: EmpRow[],
  onLegend: (items: { key: string; color: string }[]) => void,
  tab: "leave" | "ot"
) {
  const onLegendRef = useRef(onLegend)
  useEffect(() => { onLegendRef.current = onLegend })

  useEffect(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    container.innerHTML = ""

    const sorted = [...active].sort((a, b) => b.reg - a.reg)
    if (!sorted.length) return

    const leaveTypes = [...new Set(sorted.flatMap(r => [...r.leaveTypes]))]
    const keys = tab === "ot" ? ["Regular", "OT"] : ["Regular", ...leaveTypes]
    const colorMap: Record<string, string> = { Regular: COLORS.regular, OT: COLORS.ot }
    leaveTypes.forEach((lt, i) => { colorMap[lt] = COLORS.leave[i % COLORS.leave.length] })

    const stackData = sorted.map(r => {
      if (tab === "ot") return { name: r.name, Regular: r.reg, OT: r.ot }
      const lm: Record<string, number> = {}
      r.rawRows.forEach((d: any) => {
        const lt = (d["Leave Description"] || "").trim()
        if (lt) lm[lt] = (lm[lt] || 0) + (Number(d["Leave Hours"]) || 0)
      })
      return { name: r.name, Regular: r.reg, ...lm }
    })

    const margin = { top: 16, right: 16, bottom: 72, left: 52 }
    const chartH = 300
    const colW = 52
    const chartW = Math.max(sorted.length * colW, 400)
    const totalW = chartW + margin.left + margin.right
    const totalH = chartH + margin.top + margin.bottom
    const maxVal = d3.max(stackData, d => keys.reduce((s, k) => s + ((d as any)[k] || 0), 0)) || 1

    const yAxisW = margin.left
    const yAxisSvg = d3.create("svg")
      .attr("width", yAxisW).attr("height", totalH)
      .style("flex-shrink", "0").style("position", "sticky")
      .style("left", "0").style("z-index", "10").style("background", "#fff")

    const yScale = d3.scaleLinear().domain([0, maxVal]).nice().range([chartH, 0])

    yAxisSvg.append("g")
      .attr("transform", `translate(${yAxisW - 1},${margin.top})`)
      .call(d3.axisLeft(yScale).ticks(5).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text").attr("font-size", 11).attr("fill", "#374151").attr("dx", -4))

    const barSvg = d3.create("svg").attr("width", totalW).attr("height", totalH)
    const g = barSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartW))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line").attr("stroke", "#e5e7eb"))
      .call(ax => ax.selectAll("text").remove())

    const xScale = d3.scaleBand().domain(sorted.map(r => r.name)).range([0, chartW]).padding(0.3)
    const stack = d3.stack<any>().keys(keys).value((d, k) => (d as any)[k] || 0)

    g.selectAll("g.layer")
      .data(stack(stackData)).join("g")
      .attr("class", "layer")
      .attr("fill", d => colorMap[d.key] || "#ccc")
      .selectAll("rect").data(d => d).join("rect")
      .attr("x", (_, i) => xScale(sorted[i].name)!)
      .attr("y", d => yScale(d[1]))
      .attr("height", d => yScale(d[0]) - yScale(d[1]))
      .attr("width", xScale.bandwidth())
      .attr("rx", 2)

    g.append("g")
      .attr("transform", `translate(0,${chartH})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text")
        .attr("font-size", 10).attr("fill", "#111827")
        .attr("text-anchor", "end").attr("transform", "rotate(-40)")
        .attr("dy", "0.35em").attr("dx", "-0.5em"))

    const wrapper = document.createElement("div")
    wrapper.style.cssText = "display:flex;align-items:flex-start;width:100%;"
    wrapper.appendChild(yAxisSvg.node()!)
    const scrollArea = document.createElement("div")
    scrollArea.style.cssText = "overflow-x:auto;flex:1;"
    scrollArea.appendChild(barSvg.node()!)
    wrapper.appendChild(scrollArea)
    container.appendChild(wrapper)

    onLegendRef.current(keys.map(k => ({ key: k, color: colorMap[k] || "#ccc" })))
  }, [active, tab])
}

interface Props {
  active: EmpRow[]
}

export default function HoursBarChart({ active }: Props) {
  const [barTab, setBarTab] = useState<"leave" | "ot">("leave")
  const [barLegend, setBarLegend] = useState<{ key: string; color: string }[]>([])
  const barContainerRef = useRef<HTMLDivElement>(null)

  useVerticalBar(barContainerRef, active, setBarLegend, barTab)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-800">Hours per Employee</div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setBarTab("leave")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${barTab === "leave" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Regular vs Leave
          </button>
          <button
            onClick={() => setBarTab("ot")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${barTab === "ot" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Regular vs OT
          </button>
        </div>
      </div>
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
  )
}
