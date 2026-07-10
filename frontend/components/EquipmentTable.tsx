"use client"
import { EquipRow } from "@/components/EquipRow"

interface Props {
  allRows: EquipRow[]
  selectedEquip: Set<string>
  onToggle: (code: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
}

export default function EquipmentTable({ allRows, selectedEquip, onToggle, onToggleAll }: Props) {
  const allChecked = selectedEquip.size === allRows.length
  const someChecked = selectedEquip.size > 0 && !allChecked

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="text-sm font-medium text-gray-800 mb-3">Equipment Summary</div>
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
                {["Code","Year","Description","Crew","Total Miles","Total Hours","Days Used","Operators"].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs text-gray-600 font-semibold bg-white">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map(r => (
                <tr key={r.code} className={`border-b border-gray-100 hover:bg-gray-50 transition-opacity ${selectedEquip.has(r.code) ? "opacity-100" : "opacity-40"}`}>
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={selectedEquip.has(r.code)}
                      onChange={e => onToggle(r.code, e.target.checked)}
                      className="cursor-pointer"
                      aria-label={`Select ${r.code}`}
                    />
                  </td>
                  <td className="py-2 px-3 font-medium text-gray-900">{r.code}</td>
                  <td className="py-2 px-3 text-gray-700">{r.year}</td>
                  <td className="py-2 px-3 text-gray-700 max-w-[200px] truncate" title={r.desc}>{r.desc}</td>
                  <td className="py-2 px-3 text-gray-700">{r.crew}</td>
                  <td className="py-2 px-3 font-semibold text-gray-900">{r.totalMiles.toFixed(0)}</td>
                  <td className="py-2 px-3 font-semibold text-gray-900">{r.totalHours.toFixed(1)}</td>
                  <td className="py-2 px-3 text-gray-700">{r.daysUsed.size}</td>
                  <td className="py-2 px-3 text-gray-500 text-xs max-w-[160px] truncate" title={[...r.operators].join(", ")}>
                    {[...r.operators].join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
