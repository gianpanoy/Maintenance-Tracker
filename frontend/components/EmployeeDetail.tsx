"use client"
import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"

const COLORS = {
  regular: "#378ADD",
  ot: "#1D9E75",
  leave: ["#D85A30","#D4537E","#BA7517","#7F77DD","#639922","#E24B4A","#5DCAA5","#EF9F27"],
}

export interface EmpRow {
  name: string
  crew: string
  reg: number
  ot: number
  leaveHrs: number
  leaveTypes: Set<string>
  rawRows: any[]
}

type LegendItem = { label: string; value: number; color: string; pct: number }

function MiniDonut({
  data,
  colors,
  label,
}: {
  data: { label: string; value: number }[]
  colors: string[]
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [legend, setLegend] = useState<LegendItem[]>([])

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const w = el.clientWidth || 200
    const h = 160
    const r = Math.min(w, h) / 2 - 8
    const svg = d3.select(el).append("svg").attr("width", w).attr("height", h)
    const g = svg.append("g").attr("transform", `translate(${w / 2},${h / 2})`)

    const total = d3.sum(data, d => d.value) || 1
    const pie = d3.pie<{ label: string; value: number }>().value(d => d.value).sort(null)
    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>()
      .innerRadius(r * 0.55)
      .outerRadius(r)

    g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (_, i) => colors[i % colors.length])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)

    setLegend(
      data.map((d, i) => ({
        label: d.label,
        value: d.value,
        color: colors[i % colors.length],
        pct: Math.round((d.value / total) * 100),
      }))
    )
  }, [data, colors])

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="text-xs font-semibold text-gray-700 mb-2">{label}</div>
      <div ref={ref} className="w-full" />
      <div className="flex flex-col gap-y-1.5 mt-2">
        {[...legend].sort((a, b) => b.pct - a.pct).map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-gray-800 font-medium flex-1">{item.label}</span>
            <span className="text-xs text-gray-500 flex-shrink-0">{item.value.toFixed(1)} hrs</span>
            <span className="text-xs font-semibold text-gray-800 flex-shrink-0 w-8 text-right">{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EmployeeDetail({
  emp,
  onClose,
}: {
  emp: EmpRow | null
  onClose: () => void
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  if (!emp) return null

  const total = emp.reg + emp.ot + emp.leaveHrs

  // Leave breakdown by type
  const leaveByType: Record<string, number> = {}
  emp.rawRows.forEach((r: any) => {
    const lt = (r["Leave Description"] || "").trim()
    if (lt) leaveByType[lt] = (leaveByType[lt] || 0) + (Number(r["Leave Hours"]) || 0)
  })
  const leaveData = Object.entries(leaveByType).map(([label, value]) => ({ label, value }))

  // Regular vs OT
  const hoursData = [
    { label: "Regular", value: emp.reg },
    { label: "Overtime", value: emp.ot },
  ]

  // Sort raw rows by date ascending
  const sortedRows = [...emp.rawRows].sort((a, b) =>
    String(a["Date"] || "").localeCompare(String(b["Date"] || ""))
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white z-50 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div>
            <div className="text-lg font-semibold text-gray-900">{emp.name}</div>
            <div className="text-sm text-gray-500 mt-0.5">Crew: <span className="font-medium text-gray-700">{emp.crew || "—"}</span></div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition p-1 rounded-lg hover:bg-gray-100 ml-4 flex-shrink-0"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Metric cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              ["Regular hrs", emp.reg.toFixed(1), COLORS.regular],
              ["OT hrs", emp.ot.toFixed(1), COLORS.ot],
              ["Leave hrs", emp.leaveHrs.toFixed(1), COLORS.leave[0]],
              ["Total hrs", total.toFixed(1), "#6B7280"],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className="text-xl font-semibold" style={{ color: String(color) }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Donut charts side by side */}
          <div className="grid grid-cols-2 gap-4">
            <MiniDonut
              data={hoursData}
              colors={[COLORS.regular, COLORS.ot]}
              label="Regular vs Overtime"
            />
            <MiniDonut
              data={leaveData.length ? leaveData : [{ label: "No leave", value: 1 }]}
              colors={leaveData.length ? COLORS.leave : ["#D1D5DB"]}
              label="Leave breakdown"
            />
          </div>

          {/* Raw entries table */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2">All entries ({sortedRows.length})</div>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="border-b border-gray-200">
                      {["Date", "Charge Code", "Function", "Regular", "OT", "Leave Type", "Leave Hrs"].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-gray-600 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r: any, i: number) => {
                      const date = String(r["Date"] || "—")
                      // Format YYYYMMDD → MM/DD/YYYY if numeric
                      const fmt = /^\d{8}$/.test(date)
                        ? `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`
                        : date
                      return (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-1.5 px-3 text-gray-700 whitespace-nowrap">{fmt}</td>
                          <td className="py-1.5 px-3 text-gray-700">{r["Charge Code"] || r["Charge"] || "—"}</td>
                          <td className="py-1.5 px-3 text-gray-700">{r["Function Code"] || r["Function"] || "—"}</td>
                          <td className="py-1.5 px-3 text-gray-800 font-medium">{(Number(r["Hours, Regular"]) || 0).toFixed(1)}</td>
                          <td className="py-1.5 px-3 text-gray-800 font-medium">{(Number(r["Hours, Overtime"]) || 0).toFixed(1)}</td>
                          <td className="py-1.5 px-3 text-gray-600">{(r["Leave Description"] || "").trim() || "—"}</td>
                          <td className="py-1.5 px-3 text-gray-800 font-medium">{(Number(r["Leave Hours"]) || 0).toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
