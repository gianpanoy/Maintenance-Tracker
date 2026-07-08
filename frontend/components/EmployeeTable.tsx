"use client"
import { EmpRow } from "@/components/EmployeeDetail"

interface Props {
  allRows: EmpRow[]
  selectedEmps: Set<string>
  onToggle: (name: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  onSelect: (row: EmpRow) => void
}

export default function EmployeeTable({ allRows, selectedEmps, onToggle, onToggleAll, onSelect }: Props) {
  const allChecked = selectedEmps.size === allRows.length
  const someChecked = selectedEmps.size > 0 && !allChecked

  return (
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
                    onChange={e => onToggleAll(e.target.checked)}
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
                    <input
                      type="checkbox"
                      checked={selectedEmps.has(r.name)}
                      onChange={e => onToggle(r.name, e.target.checked)}
                      className="cursor-pointer"
                      aria-label={`Select ${r.name}`}
                    />
                  </td>
                  <td
                    className="py-2 px-3 cursor-pointer hover:text-blue-600 hover:underline font-medium"
                    style={{ color: "#111827" }}
                    onClick={() => onSelect(r)}
                  >{r.name}</td>
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
  )
}
