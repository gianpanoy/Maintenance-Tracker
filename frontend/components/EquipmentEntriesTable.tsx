"use client"
import { useMemo, useState } from "react"
import { EquipRow } from "@/components/EquipRow"

const TYPE_COLORS: Record<string, string> = {
  "Truck":            "#378ADD",
  "Van":              "#1D9E75",
  "Tractor/Mower":    "#D85A30",
  "Compact":          "#BA7517",
  "Heavy Equipment":  "#7F77DD",
  "Trailer":          "#D4537E",
  "Support Equipment":"#639922",
  "Other":            "#9CA3AF",
}

function typeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS["Other"]
}

function formatDate(d: string): string {
  if (!d || d.length < 8) return d || "—"
  const y = d.slice(0, 4), m = d.slice(4, 6), day = d.slice(6, 8)
  const dt = new Date(Number(y), Number(m) - 1, Number(day))
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" })
}

interface Props {
  allRows: EquipRow[]
}

export default function EquipmentEntriesTable({ allRows }: Props) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const groups = useMemo(() =>
    [...allRows]
      .map(r => ({
        code: r.code,
        desc: r.desc,
        equipType: r.equipType,
        entries: [...r.rawRows].sort((a: any, b: any) => String(a["Date"]).localeCompare(String(b["Date"]))),
      }))
      .sort((a, b) => a.equipType.localeCompare(b.equipType) || a.code.localeCompare(b.code)),
    [allRows]
  )

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map(g => {
        const groupMatches = g.code.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q)
        if (groupMatches) return g
        const entries = g.entries.filter((row: any) =>
          String(row["Charge Code"] || "").toLowerCase().includes(q) ||
          String(row["Charge Description"] || "").toLowerCase().includes(q) ||
          String(row["Function Description"] || "").toLowerCase().includes(q) ||
          String(row["Remarks"] || "").toLowerCase().includes(q) ||
          String(row["Work Order Description"] || "").toLowerCase().includes(q)
        )
        return entries.length ? { ...g, entries } : null
      })
      .filter((g): g is typeof groups[number] => g !== null)
  }, [groups, query])

  function toggle(code: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(filteredGroups.map(g => g.code)))
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  return (
    <div className="relative">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search equipment, charge code, function..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 w-72"
        />
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={expandAll} className="px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs text-gray-600 font-medium">
            Expand all
          </button>
          <button onClick={collapseAll} className="px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs text-gray-600 font-medium">
            Collapse all
          </button>
        </div>
      </div>

      {/* Groups */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
        {filteredGroups.map(g => {
          const isOpen = expanded.has(g.code)
          const totalMiles = g.entries.reduce((s: number, r: any) => s + (Number(r["Run Miles"]) || 0), 0)
          const totalHours = g.entries.reduce((s: number, r: any) => s + (Number(r["Run Hours"]) || 0), 0)

          return (
            <div key={g.code}>
              <button
                onClick={() => toggle(g.code)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
              >
                <svg
                  width="12" height="12" viewBox="0 0 16 16" fill="none"
                  className={`flex-shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                >
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: typeColor(g.equipType) }} />
                <span className="text-xs font-semibold text-gray-900">{g.code}</span>
                <span className="text-xs text-gray-400 truncate flex-1">{g.desc}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{g.entries.length} entries</span>
                {totalMiles > 0 && <span className="text-xs text-blue-600 font-medium flex-shrink-0">{totalMiles.toFixed(0)} mi</span>}
                {totalHours > 0 && <span className="text-xs text-green-600 font-medium flex-shrink-0">{totalHours.toFixed(1)} hrs</span>}
              </button>

              {isOpen && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Date</th>
                        <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Crew</th>
                        <th className="px-3 py-1.5 text-left font-medium">Charge Code</th>
                        <th className="px-3 py-1.5 text-left font-medium">Charge Description</th>
                        <th className="px-3 py-1.5 text-left font-medium">Function</th>
                        <th className="px-3 py-1.5 text-left font-medium">Work Order</th>
                        <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">Miles</th>
                        <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">Hours</th>
                        <th className="px-3 py-1.5 text-left font-medium">Operator</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.entries.map((row: any, i: number) => (
                        <tr key={i} className={`border-t border-gray-100 ${i % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">{formatDate(String(row["Date"] || ""))}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{row["Crew Code"] || "—"}</td>
                          <td className="px-3 py-1.5 text-gray-500">{row["Charge Code"] || "—"}</td>
                          <td className="px-3 py-1.5 text-gray-700 truncate max-w-[220px]" title={row["Charge Description"] || ""}>
                            {row["Charge Description"] || "—"}
                          </td>
                          <td className="px-3 py-1.5 text-gray-700 truncate max-w-[180px]" title={row["Function Description"] || ""}>
                            {row["Function Description"] || "—"}
                          </td>
                          <td className="px-3 py-1.5 text-gray-500 truncate max-w-[180px]" title={row["Work Order Description"] || ""}>
                            {row["Work Order Description"] || "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-blue-600 font-medium whitespace-nowrap">
                            {Number(row["Run Miles"]) > 0 ? Number(row["Run Miles"]).toFixed(0) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-green-600 font-medium whitespace-nowrap">
                            {Number(row["Run Hours"]) > 0 ? Number(row["Run Hours"]).toFixed(1) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-gray-500 truncate max-w-[140px]" title={row["Remarks"] || ""}>
                            {row["Remarks"] || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}

        {filteredGroups.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No entries match your search</div>
        )}
      </div>
    </div>
  )
}
