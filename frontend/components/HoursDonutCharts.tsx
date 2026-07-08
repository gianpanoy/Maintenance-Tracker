"use client"
import { useEffect, useRef, useState, useMemo } from "react"
import * as d3 from "d3"
import { EmpRow } from "@/components/EmployeeDetail"

const COLORS = {
  regular: "#378ADD",
  ot: "#1D9E75",
  leave: ["#D85A30","#D4537E","#BA7517","#7F77DD","#639922","#E24B4A","#5DCAA5","#EF9F27"],
}

const NO_LEAVE_COLORS = ["#B4B2A9"]

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

interface Props {
  active: EmpRow[]
}

export default function HoursDonutCharts({ active }: Props) {
  const [pieTab, setPieTab] = useState<"leave" | "ot">("leave")
  const [pieLegend, setPieLegend] = useState<LegendItem[]>([])
  const [leaveLegend, setLeaveLegend] = useState<LegendItem[]>([])

  const pieRef = useRef<HTMLDivElement>(null)
  const leaveRef = useRef<HTMLDivElement>(null)

  const totalReg = active.reduce((s, r) => s + r.reg, 0)
  const totalOT = active.reduce((s, r) => s + r.ot, 0)
  const totalLeave = active.reduce((s, r) => s + r.leaveHrs, 0)

  const leaveMap = useMemo(() => {
    const map: Record<string, number> = {}
    active.forEach(r => {
      r.rawRows.forEach((d: any) => {
        const lt = (d["Leave Description"] || "").trim()
        if (lt) map[lt] = (map[lt] || 0) + (Number(d["Leave Hours"]) || 0)
      })
    })
    return map
  }, [active])

  const pieData = useMemo(() =>
    pieTab === "leave"
      ? [{ label: "Regular", value: totalReg }, { label: "Leave", value: totalLeave }]
      : [{ label: "Regular", value: totalReg }, { label: "OT", value: totalOT }],
    [pieTab, totalReg, totalOT, totalLeave]
  )

  const pieColors = useMemo(() =>
    pieTab === "leave"
      ? [COLORS.regular, COLORS.leave[0]]
      : [COLORS.regular, COLORS.ot],
    [pieTab]
  )

  const leaveData = useMemo(() =>
    Object.entries(leaveMap).map(([label, value]) => ({ label, value })),
    [leaveMap]
  )

  const leaveChartData = useMemo(() =>
    leaveData.length ? leaveData : [{ label: "No leave", value: 1 }],
    [leaveData]
  )

  const leaveChartColors = leaveData.length ? COLORS.leave : NO_LEAVE_COLORS

  useDoughnut(pieRef, pieData, pieColors, setPieLegend)
  useDoughnut(leaveRef, leaveChartData, leaveChartColors, setLeaveLegend)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

      {/* Left — tabbed breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-800">Hours Breakdown</div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setPieTab("leave")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${pieTab === "leave" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Regular vs Leave
            </button>
            <button
              onClick={() => setPieTab("ot")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${pieTab === "ot" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Regular vs OT
            </button>
          </div>
        </div>
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

      {/* Right — Leave hours by type */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-800 mb-3">Leave Hours by Type</div>
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
  )
}
