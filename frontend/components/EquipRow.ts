export interface EquipRow {
  code: string
  year: string
  desc: string
  crew: string
  totalMiles: number
  totalHours: number
  daysUsed: Set<string>
  functions: Record<string, number>
  operators: Set<string>
  rawRows: any[]
}
