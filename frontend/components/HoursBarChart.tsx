"use client"
import { useEffect, useRef, useState, useMemo } from "react"
import * as d3 from "d3"
import { EmpRow } from "@/components/EmployeeDetail"

const COLORS = {
  regular: "#378ADD",
  ot: "#1D9E75",
  leave: ["#D85A30","#D4537E","#BA7517","#7F77DD","#639922","#E24B4A","#5DCAA5","#EF9F27"],
  maxLine: "#EF4444",
}

type BarTab = "leave" | "ot"
type SortKey = "regular" | "ot" | "total" | `leave:${string}`

function buildStackData(active: EmpRow[], tab: BarTab) {
  if (tab === "ot") {
    return active.map(r => ({ name: r.name, Regular: r.reg, OT: r.ot }))
  }
  return active.map(r => {
    const lm: Record<string, number> = {}
    r.rawRows.forEach((d: any) => {
      const lt = (d["Leave Description"] || "").trim()
      if (lt) lm[lt] = (lm[lt] || 0) + (Number(d["Leave Hours"]) || 0)
    })
    return { name: r.name, Regular: r.reg, ...lm }
  })
}

// Shared tooltip helpers
function showTooltip(tooltipEl: HTMLDivElement | null, event: MouseEvent, html: string) {
  if (!tooltipEl) return
  d3.select(tooltipEl)
    .style("opacity", 1)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY - 12}px`)
    .html(html)
}
function moveTooltip(tooltipEl: HTMLDivElement | null, event: MouseEvent) {
  if (!tooltipEl) return
  d3.select(tooltipEl)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY - 12}px`)
}
function hideTooltip(tooltipEl: HTMLDivElement | null) {
  if (!tooltipEl) return
  d3.select(tooltipEl).style("opacity", 0)
}

function useVerticalBar(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  tooltipRef: React.RefObject<HTMLDivElement | null>,
  active: EmpRow[],
  sortKey: SortKey,
  tab: BarTab,
  hidden: Set<string>,
  colorMap: Record<string, string>,
  onKeys: (keys: string[]) => void
) {
  const onKeysRef = useRef(onKeys)
  useEffect(() => { onKeysRef.current = onKeys })

  useEffect(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    container.innerHTML = ""
    if (!active.length) return

    const fullStack = buildStackData(active, tab)
    const leaveTypes = tab === "ot"
      ? []
      : [...new Set(active.flatMap(r => [...r.leaveTypes]))]
    const allKeys = tab === "ot" ? ["Regular", "OT"] : ["Regular", ...leaveTypes]
    onKeysRef.current(allKeys)

    const visibleKeys = allKeys.filter(k => !hidden.has(k))

    const sorted = [...active].sort((a, b) => {
      const aData = fullStack.find(d => d.name === a.name)!
      const bData = fullStack.find(d => d.name === b.name)!
      if (sortKey === "regular") return (bData.Regular as number) - (aData.Regular as number)
      if (sortKey === "ot") return b.ot - a.ot
      if (sortKey === "total") return (b.reg + b.ot + b.leaveHrs) - (a.reg + a.ot + a.leaveHrs)
      if (sortKey.startsWith("leave:")) {
        const lt = sortKey.slice(6)
        return ((bData as any)[lt] || 0) - ((aData as any)[lt] || 0)
      }
      return 0
    })

    const sortedStack = sorted.map(r => fullStack.find(d => d.name === r.name)!)
    const totalByName = new Map(sorted.map(r => [r.name, r.reg + r.ot + r.leaveHrs]))

    const maxCapacity = d3.max(active, r => r.reg + r.leaveHrs) || 0
    const showCapacityLine = sortKey === "regular" || sortKey === "ot" || sortKey === "total"

    const margin = { top: 16, right: 16, bottom: 72, left: 52 }
    const chartH = 300
    const colW = 52
    const chartW = Math.max(sorted.length * colW, 400)
    const totalW = chartW + margin.left + margin.right
    const totalH = chartH + margin.top + margin.bottom

    const maxStack = d3.max(sortedStack, d => visibleKeys.reduce((s, k) => s + ((d as any)[k] || 0), 0)) || 1
    const yMax = showCapacityLine
      ? Math.max(maxStack, maxCapacity) * 1.05
      : maxStack * 1.05

    const yAxisW = margin.left
    const yAxisSvg = d3.create("svg")
      .attr("width", yAxisW).attr("height", totalH)
      .style("flex-shrink", "0").style("position", "sticky")
      .style("left", "0").style("z-index", "10").style("background", "#fff")

    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([chartH, 0])

    const yAxisG = yAxisSvg.append("g")
      .attr("transform", `translate(${yAxisW - 1},${margin.top})`)
      .call(d3.axisLeft(yScale).ticks(5).tickSize(0))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick text")
        .attr("font-size", 11)
        .attr("fill", "#374151")
        .attr("dx", -4)
      )

    // Capacity tick on Y axis — only for hours sorts
    if (showCapacityLine) {
      const capY = yScale(maxCapacity)
      yAxisG.append("text")
        .attr("x", -4)
        .attr("y", capY)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", 10)
        .attr("font-weight", "600")
        .attr("fill", COLORS.maxLine)
        .text(maxCapacity.toFixed(1))
    }

    const barSvg = d3.create("svg").attr("width", totalW).attr("height", totalH)
    const g = barSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartW))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line").attr("stroke", "#e5e7eb"))
      .call(ax => ax.selectAll("text").remove())

    const xScale = d3.scaleBand().domain(sorted.map(r => r.name)).range([0, chartW]).padding(0.3)
    const stack = d3.stack<any>().keys(visibleKeys).value((d, k) => (d as any)[k] || 0)

    // Per-employee highlight wash — appended before the bars so it sits behind them.
    // Toggled by the hover-capture overlay below, not hovered directly.
    const highlightRect = g.append("rect")
      .attr("class", "hover-highlight")
      .attr("y", 0)
      .attr("height", chartH)
      .attr("fill", "#111827")
      .attr("opacity", 0)
      .attr("pointer-events", "none")

    g.selectAll("g.layer")
      .data(stack(sortedStack)).join("g")
      .attr("class", "layer")
      .attr("fill", d => colorMap[d.key] || "#ccc")
      .each(function (series) {
        const key = series.key
        const baseColor = colorMap[key] || "#ccc"
        d3.select(this).selectAll("rect").data(series).join("rect")
          .attr("x", (_, i) => xScale(sorted[i].name)!)
          .attr("y", d => yScale(d[1]))
          .attr("height", d => yScale(d[0]) - yScale(d[1]))
          .attr("width", xScale.bandwidth())
          .attr("rx", 2)
          .attr("pointer-events", "none") // hover is handled by the full-column overlay instead
      })

    // Full-column hover overlay — one invisible rect per employee spanning the whole
    // bar height, so hovering anywhere on their column shows every category at once
    // rather than whatever thin segment the cursor happens to land on.
    g.selectAll("rect.hover-target")
      .data(sorted).join("rect")
      .attr("class", "hover-target")
      .attr("x", d => xScale(d.name)!)
      .attr("y", 0)
      .attr("width", xScale.bandwidth())
      .attr("height", chartH)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        highlightRect
          .attr("x", xScale(d.name)!)
          .attr("width", xScale.bandwidth())
          .attr("opacity", 0.06)

        const row = sortedStack.find(s => s.name === d.name)!
        const total = totalByName.get(d.name) ?? 0
        const lines = visibleKeys
          .map(key => ({ key, value: (row as any)[key] || 0 }))
          .filter(({ value }) => value > 0)
          .map(({ key, value }) => `
            <div class="flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-sm flex-shrink-0" style="background:${colorMap[key] || '#ccc'}"></span>
              <span class="text-gray-600">${key}:</span>
              <span class="text-gray-900 font-medium">${value.toFixed(2)} hrs</span>
            </div>`)
          .join("")

        showTooltip(
          tooltipRef.current,
          event,
          `<div class="font-medium text-gray-900 mb-1">${d.name}</div>
           ${lines || '<div class="text-gray-400">No hours recorded</div>'}
           <div class="text-gray-400 mt-1 pt-1 border-t border-gray-100">Total: ${total.toFixed(2)} hrs</div>`
        )
      })
      .on("mousemove", (event) => moveTooltip(tooltipRef.current, event))
      .on("mouseout", function () {
        highlightRect.attr("opacity", 0)
        hideTooltip(tooltipRef.current)
      })

    // Max capacity line — only for hours sorts
    if (showCapacityLine) {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", chartW)
        .attr("y1", yScale(maxCapacity))
        .attr("y2", yScale(maxCapacity))
        .attr("stroke", COLORS.maxLine)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5,4")

      g.append("text")
        .attr("x", chartW - 4)
        .attr("y", yScale(maxCapacity) - 5)
        .attr("text-anchor", "end")
        .attr("font-size", 10)
        .attr("font-weight", "600")
        .attr("fill", COLORS.maxLine)
        .text(`Max capacity: ${maxCapacity.toFixed(1)} hrs`)
    }

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
  }, [active, sortKey, tab, hidden, colorMap, tooltipRef])
}

interface Props {
  active: EmpRow[]
}

export default function HoursBarChart({ active }: Props) {
  const [barTab, setBarTab] = useState<BarTab>("leave")
  const [sortKey, setSortKey] = useState<SortKey>("regular")
  const [allKeys, setAllKeys] = useState<string[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const allKeysRef = useRef<string[]>([])
  useEffect(() => { allKeysRef.current = allKeys }, [allKeys])

  const barContainerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const leaveTypes = useMemo(() =>
    [...new Set(active.flatMap(r => [...r.leaveTypes]))].sort(),
    [active]
  )

  const colorMap = useMemo(() => {
    const map: Record<string, string> = { Regular: COLORS.regular, OT: COLORS.ot }
    leaveTypes.forEach((lt, i) => { map[lt] = COLORS.leave[i % COLORS.leave.length] })
    return map
  }, [leaveTypes])

  const prevSortKey = useRef<SortKey>("regular")
  useEffect(() => {
    if (prevSortKey.current === sortKey) return
    prevSortKey.current = sortKey
    const keys = allKeysRef.current
    if (!keys.length) return
    if (sortKey === "regular" || sortKey === "total") { setHidden(new Set()); return }
    if (sortKey === "ot") { setHidden(new Set(keys.filter(k => k !== "OT"))); return }
    if (sortKey.startsWith("leave:")) {
      const lt = sortKey.slice(6)
      setHidden(new Set(keys.filter(k => k !== lt)))
    }
  }, [sortKey])

  useEffect(() => {
    setSortKey("regular")
    setHidden(new Set())
    prevSortKey.current = "regular"
  }, [barTab])

  function toggleKey(key: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const maxCapacity = useMemo(() =>
    d3.max(active, r => r.reg + r.leaveHrs) || 0,
    [active]
  )

  const showCapacityLine = sortKey === "regular" || sortKey === "ot" || sortKey === "total"

  useVerticalBar(barContainerRef, tooltipRef, active, sortKey, barTab, hidden, colorMap, setAllKeys)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      {/* Hover tooltip — shows exact figures for the segment under the cursor */}
      <div
        ref={tooltipRef}
        className="fixed pointer-events-none opacity-0 transition-opacity duration-100 bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs z-50"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="text-sm font-medium text-gray-800">Hours per Employee</div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Sort by</label>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-800 bg-white"
            >
              <optgroup label="Hours">
                <option value="regular">Regular (show all)</option>
                <option value="ot">Overtime</option>
                <option value="total">Total hours (show all)</option>
              </optgroup>
              {leaveTypes.length > 0 && (
                <optgroup label="Leave type">
                  {leaveTypes.map(lt => (
                    <option key={lt} value={`leave:${lt}`}>{lt}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
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
      </div>

      <div ref={barContainerRef} className="w-full" />

      {allKeys.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400 w-full mb-0.5">Click to show / hide</span>
          {allKeys.map(key => {
            const isHidden = hidden.has(key)
            return (
              <button
                key={key}
                onClick={() => toggleKey(key)}
                title={isHidden ? `Show ${key}` : `Hide ${key}`}
                className={`flex items-center gap-1.5 transition-opacity cursor-pointer ${isHidden ? "opacity-30" : "opacity-100"}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0 border"
                  style={{
                    backgroundColor: isHidden ? "transparent" : (colorMap[key] || "#ccc"),
                    borderColor: colorMap[key] || "#ccc",
                  }}
                />
                <span className={`text-xs font-medium ${isHidden ? "text-gray-400 line-through" : "text-gray-800"}`}>
                  {key}
                </span>
              </button>
            )
          })}
          {/* Max capacity legend — only for hours sorts */}
          {showCapacityLine && (
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-200">
              <svg width="18" height="10">
                <line x1="0" y1="5" x2="18" y2="5" stroke={COLORS.maxLine} strokeWidth="1.5" strokeDasharray="5,4" />
              </svg>
              <span className="text-xs font-medium text-red-500">
                Max capacity ({maxCapacity.toFixed(1)} hrs)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
