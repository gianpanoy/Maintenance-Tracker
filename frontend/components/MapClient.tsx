"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import { EquipRow } from "@/components/EquipRow"

const KAUAI_CENTER: [number, number] = [22.0964, -159.5261]
const DEFAULT_ZOOM = 11

const EQUIPMENT_COLOR = "#378ADD"
const LABOR_COLOR = "#D85A30"

// ---- Equipment (reuses the existing pre-baked /api/gis/segments) ----

interface EquipmentSegmentProps {
  section_id: string
  route: number
  mm_start: number
  mm_end: number
  description: string
  charge_codes: string[]
}

const EQUIP_TYPE_MAP: Record<string, string> = {
  "UTILITY TRUCK": "Truck", "HOOK LIFT": "Truck", "TANK TRUCK": "Truck",
  "SERVICE TRUCK": "Truck", "DUMP TRUCK": "Truck", "STAKE": "Truck",
  "CAB/CHASSIS": "Truck", "CREW CAB": "Truck", "PICKUP": "Truck", "P/U": "Truck",
  "TRUCK": "Truck", "F150": "Truck", "F250": "Truck", "F350": "Truck", "F450": "Truck",
  "PASSENGER VAN": "Van", "VAN": "Van",
  "GUARDRAIL MOWER": "Tractor/Mower", "ZERO TURN": "Tractor/Mower", "ROTARY": "Tractor/Mower",
  "MOWER": "Tractor/Mower", "TRACTOR": "Tractor/Mower",
  "MINI EXCAVATOR": "Compact", "TRACKLOADER": "Compact", "TRACK LOADER": "Compact",
  "SKIDSTEER": "Compact", "SKID STEER": "Compact", "COMPACT": "Compact",
  "BACKHOE": "Heavy Equipment", "EXCAVATOR": "Heavy Equipment", "LOADER": "Heavy Equipment",
  "GRADER": "Heavy Equipment", "ROLLER": "Heavy Equipment", "CRANE": "Heavy Equipment",
  "LOWBOY": "Trailer", "BOAT TRAILER": "Trailer", "TRAILER": "Trailer",
  "MESSAGE BOARD": "Support Equipment", "WANCO": "Support Equipment", "CHIPPER": "Support Equipment",
  "AERIAL": "Support Equipment", "GENERATOR": "Support Equipment", "COMPRESSOR": "Support Equipment",
}

function getEquipType(desc: string): string {
  const upper = desc.toUpperCase()
  for (const [key, type] of Object.entries(EQUIP_TYPE_MAP)) {
    if (upper.includes(key)) return type
  }
  return "Other"
}

function buildEquipRows(data: any[]): EquipRow[] {
  const map: Record<string, EquipRow> = {}
  data.forEach((r: any) => {
    const fleet = String(r["Fleet Code"] || "").trim()
    const unit = String(r["Unit Number"] || "").trim()
    const fleetDigit = fleet.length >= 4 ? fleet[3] : ""
    const equipId = fleetDigit && unit ? `${fleetDigit}${unit}` : unit || "Unknown"
    const desc = String(r["Equipment Description"] || "").trim()
    if (!map[equipId]) map[equipId] = {
      code: equipId, year: String(r["Equipment Year"] || "").trim(), desc,
      crew: String(r["Crew Code"] || "").trim(), equipType: getEquipType(desc),
      totalMiles: 0, totalHours: 0, daysUsed: new Set(), functions: {},
      operators: new Set(), rawRows: [],
    }
    map[equipId].totalMiles += Number(r["Run Miles"]) || 0
    map[equipId].totalHours += Number(r["Run Hours"]) || 0
    if (r["Date"]) map[equipId].daysUsed.add(String(r["Date"]))
    map[equipId].rawRows.push(r)
  })
  return Object.values(map)
}

// ---- Labor (new /api/gis/labor-segments) ----

interface LaborSegmentProps {
  charge_code: string
  route: number
  mm_from: number
  mm_to: number | null
  kind: "point" | "range"
}

interface LaborStats {
  regHours: number
  otHours: number
  employees: Map<string, { name: string; regHours: number; otHours: number }>
}

function laborKey(chargeCode: string, mmFrom: number, mmTo: number | null | string) {
  const to = mmTo === "" || mmTo === undefined ? null : mmTo
  return `${chargeCode}|${mmFrom}|${to}`
}

type LayerName = "labor" | "equipment"

export default function MapClient() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const equipLayerRef = useRef<L.GeoJSON | null>(null)
  const laborLayerRef = useRef<L.GeoJSON | null>(null)

  const [visibleLayers, setVisibleLayers] = useState<Set<LayerName>>(new Set(["labor"]))

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [crew, setCrew] = useState("")
  const [crews, setCrews] = useState<string[]>([])

  const [equipRawData, setEquipRawData] = useState<any[] | null>(null)
  const [laborRawData, setLaborRawData] = useState<any[] | null>(null)
  const [hasEquipSession, setHasEquipSession] = useState(false)
  const [hasLaborSession, setHasLaborSession] = useState(false)

  const [equipSegments, setEquipSegments] = useState<FeatureCollection<Geometry, EquipmentSegmentProps> | null>(null)
  const [laborSegments, setLaborSegments] = useState<FeatureCollection<Geometry, LaborSegmentProps> | null>(null)
  const [loadErrors, setLoadErrors] = useState<string[]>([])

  const [selected, setSelected] = useState<{ layer: LayerName; key: string } | null>(null)

  // ---- initial load: sessions, shared filters, both raw datasets ----
  useEffect(() => {
    const equipId = localStorage.getItem("equipment_session_id")
    const laborId = localStorage.getItem("session_id")

    if (!equipId && !laborId) { router.push("/upload"); return }

    setHasEquipSession(!!equipId)
    setHasLaborSession(!!laborId)

    const sharedStart = localStorage.getItem("shared_filter_start") || ""
    const sharedEnd = localStorage.getItem("shared_filter_end") || ""
    const sharedCrew = localStorage.getItem("shared_filter_crew") || ""
    setStartDate(sharedStart)
    setEndDate(sharedEnd)
    setCrew(sharedCrew)

    const crewSet = new Set<string>()

    const loaders: Promise<any>[] = []
    if (equipId) {
      loaders.push(
        axios.get(`http://localhost:8000/api/session/equipment/${equipId}`)
          .then(res => {
            const data = res.data.raw || []
            data.forEach((r: any) => { if (r["Crew Code"]) crewSet.add(r["Crew Code"]) })
            setEquipRawData(data)
          })
          .catch(() => setLoadErrors(prev => [...prev, "Couldn't load the equipment session."]))
      )
    }
    if (laborId) {
      loaders.push(
        axios.get(`http://localhost:8000/api/session/${laborId}`)
          .then(res => {
            const data = res.data.raw || []
            data.forEach((r: any) => { if (r["Crew Code"]) crewSet.add(r["Crew Code"]) })
            setLaborRawData(data)
          })
          .catch(() => setLoadErrors(prev => [...prev, "Couldn't load the labor session."]))
      )
    }
    Promise.all(loaders).then(() => setCrews([...crewSet].sort()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- date/crew-filtered views of each raw dataset ----
  const equipActive = useMemo<EquipRow[]>(() => {
    if (!equipRawData) return []
    const sf = startDate.replace(/-/g, "")
    const ef = endDate.replace(/-/g, "")
    const filtered = equipRawData.filter((r: any) => {
      const d = String(r["Date"] || "")
      if (sf && d < sf) return false
      if (ef && d > ef) return false
      if (crew && r["Crew Code"] !== crew) return false
      return true
    })
    return buildEquipRows(filtered)
  }, [equipRawData, startDate, endDate, crew])

  const laborActive = useMemo(() => {
    if (!laborRawData) return []
    const sf = startDate.replace(/-/g, "")
    const ef = endDate.replace(/-/g, "")
    return laborRawData.filter((r: any) => {
      const d = String(r["Date"] || "")
      if (sf && d < sf) return false
      if (ef && d > ef) return false
      if (crew && r["Crew Code"] !== crew) return false
      return true
    })
  }, [laborRawData, startDate, endDate, crew])

  // ---- fetch equipment segment geometry once, when the equipment session is available ----
  useEffect(() => {
    if (!hasEquipSession) return
    axios.get("http://localhost:8000/api/gis/segments")
      .then(res => setEquipSegments(res.data))
      .catch(() => setLoadErrors(prev => [...prev, "Couldn't load equipment road segments."]))
  }, [hasEquipSession])

  // ---- fetch labor segment geometry once, from the FULL (unfiltered) raw
  // labor data — the set of unique locations is a property of the whole
  // uploaded file, not of whatever date/crew filter happens to be active
  // right now. Filtering only changes which of these get highlighted.
  useEffect(() => {
    if (!laborRawData) return
    console.log(`[CombinedMap] Labor session has ${laborRawData.length} raw row(s). Sample row:`, laborRawData[0])
    const seen = new Set<string>()
    const entries: { charge_code: string; mm_from: number; mm_to: number | null }[] = []
    let missingChargeCode = 0
    let missingMileMarker = 0
    laborRawData.forEach((r: any) => {
      const code = String(r["Charge Code"] || "").trim()
      const from = r["Mile Marker, From"]
      if (!code) { missingChargeCode++; return }
      if (from === "" || from === undefined || from === null) { missingMileMarker++; return }
      const to = r["Mile Marker, To"]
      const toVal = (to === "" || to === undefined || to === null) ? null : Number(to)
      const key = laborKey(code, Number(from), toVal)
      if (seen.has(key)) return
      seen.add(key)
      entries.push({ charge_code: code, mm_from: Number(from), mm_to: toVal })
    })
    console.log(`[CombinedMap] ${entries.length} unique location(s) to fetch. ` +
                `Skipped: ${missingChargeCode} row(s) with no Charge Code, ` +
                `${missingMileMarker} row(s) with no Mile Marker From.`)
    if (entries.length === 0) {
      console.warn("[CombinedMap] No labor entries have both a Charge Code and a Mile Marker — " +
                    "nothing to send to /api/gis/labor-segments. If Charge Code is missing on " +
                    "every row, this session was likely uploaded before the entries.py fix — " +
                    "try re-uploading the labor file.")
      return
    }
    axios.post("http://localhost:8000/api/gis/labor-segments", { entries })
      .then(res => {
        console.log(`[CombinedMap] Labor: ${res.data.meta.resolved}/${res.data.meta.unique_locations} unique locations resolved`)
        if (res.data.meta.skipped?.length) {
          console.warn("[CombinedMap] Labor locations that couldn't be mapped:", res.data.meta.skipped)
        }
        setLaborSegments(res.data)
      })
      .catch(() => setLoadErrors(prev => [...prev, "Couldn't load labor road segments."]))
  }, [laborRawData])

  // ---- aggregate filtered equipment data by charge code, join to sections ----
  const equipStatsByCode = useMemo(() => {
    const map = new Map<string, { miles: number; hours: number }>()
    equipActive.forEach(r => {
      r.rawRows.forEach((row: any) => {
        const code = String(row["Charge Code"] || "").trim()
        if (!code) return
        if (!map.has(code)) map.set(code, { miles: 0, hours: 0 })
        const s = map.get(code)!
        s.miles += Number(row["Run Miles"]) || 0
        s.hours += Number(row["Run Hours"]) || 0
      })
    })
    return map
  }, [equipActive])

  const equipSectionStats = useMemo(() => {
    const map = new Map<string, { miles: number; hours: number }>()
    if (!equipSegments) return map
    equipSegments.features.forEach(f => {
      const props = f.properties as EquipmentSegmentProps
      const combined = { miles: 0, hours: 0 }
      props.charge_codes.forEach(code => {
        const s = equipStatsByCode.get(code)
        if (!s) return
        combined.miles += s.miles
        combined.hours += s.hours
      })
      map.set(props.section_id, combined)
    })
    return map
  }, [equipSegments, equipStatsByCode])

  // ---- aggregate filtered labor data by (charge_code, mm_from, mm_to), join to labor segments ----
  const laborStatsByKey = useMemo(() => {
    const map = new Map<string, LaborStats>()
    laborActive.forEach((r: any) => {
      const code = String(r["Charge Code"] || "").trim()
      const from = r["Mile Marker, From"]
      if (!code || from === "" || from === undefined || from === null) return
      const to = r["Mile Marker, To"]
      const toVal = (to === "" || to === undefined || to === null) ? null : Number(to)
      const key = laborKey(code, Number(from), toVal)
      if (!map.has(key)) map.set(key, { regHours: 0, otHours: 0, employees: new Map() })
      const stats = map.get(key)!
      const reg = Number(r["Hours, Regular"]) || 0
      const ot = Number(r["Hours, Overtime"]) || 0
      stats.regHours += reg
      stats.otHours += ot
      const empName = r["Employee Name"] || "Unknown"
      if (!stats.employees.has(empName)) stats.employees.set(empName, { name: empName, regHours: 0, otHours: 0 })
      const emp = stats.employees.get(empName)!
      emp.regHours += reg
      emp.otHours += ot
    })
    return map
  }, [laborActive])

  const equipMaxHours = useMemo(() => {
    let max = 0
    equipSectionStats.forEach(s => { if (s.hours > max) max = s.hours })
    return max
  }, [equipSectionStats])

  const laborMaxHours = useMemo(() => {
    let max = 0
    laborStatsByKey.forEach(s => { if (s.regHours + s.otHours > max) max = s.regHours + s.otHours })
    return max
  }, [laborStatsByKey])

  // ---- map lifecycle: create once ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: KAUAI_CENTER, zoom: DEFAULT_ZOOM })
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ---- equipment layer: (re)build on data/visibility change ----
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (equipLayerRef.current) { equipLayerRef.current.remove(); equipLayerRef.current = null }
    if (!equipSegments || !visibleLayers.has("equipment")) return

    const layer = L.geoJSON(equipSegments as any, {
      style: (feature) => {
        const props = feature!.properties as EquipmentSegmentProps
        const stats = equipSectionStats.get(props.section_id)
        const hasData = stats && stats.hours > 0
        const intensity = hasData && equipMaxHours > 0 ? Math.min(1, stats!.hours / equipMaxHours) : 0
        return {
          color: EQUIPMENT_COLOR,
          weight: hasData ? 5 + intensity * 2 : 2,
          opacity: hasData ? 0.75 + intensity * 0.25 : 0.25,
        }
      },
      onEachFeature: (feature, lyr) => {
        lyr.on("click", () => {
          const sectionId = (feature.properties as EquipmentSegmentProps).section_id
          console.log(`[CombinedMap] Equipment segment clicked: ${sectionId}`)
          setSelected({ layer: "equipment", key: sectionId })
        })
      },
    })
    layer.addTo(map)
    equipLayerRef.current = layer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipSegments, equipSectionStats, equipMaxHours, visibleLayers])

  // ---- labor layer: (re)build on data/visibility change ----
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (laborLayerRef.current) { laborLayerRef.current.remove(); laborLayerRef.current = null }
    if (!laborSegments || !visibleLayers.has("labor")) return

    const layer = L.geoJSON(laborSegments as any, {
      style: (feature) => {
        const props = feature!.properties as LaborSegmentProps
        const key = laborKey(props.charge_code, props.mm_from, props.mm_to)
        const stats = laborStatsByKey.get(key)
        const totalHours = stats ? stats.regHours + stats.otHours : 0
        const hasData = totalHours > 0
        const intensity = hasData && laborMaxHours > 0 ? Math.min(1, totalHours / laborMaxHours) : 0
        return {
          color: LABOR_COLOR,
          weight: hasData ? 5 + intensity * 2 : 2,
          opacity: hasData ? 0.75 + intensity * 0.25 : 0.25,
        }
      },
      pointToLayer: (feature, latlng) => {
        const props = feature.properties as LaborSegmentProps
        const key = laborKey(props.charge_code, props.mm_from, props.mm_to)
        const stats = laborStatsByKey.get(key)
        const totalHours = stats ? stats.regHours + stats.otHours : 0
        const hasData = totalHours > 0
        const intensity = hasData && laborMaxHours > 0 ? Math.min(1, totalHours / laborMaxHours) : 0
        return L.circleMarker(latlng, {
          radius: hasData ? 6 + intensity * 4 : 4,
          color: LABOR_COLOR,
          fillColor: LABOR_COLOR,
          fillOpacity: hasData ? 0.75 + intensity * 0.25 : 0.3,
          opacity: hasData ? 0.9 : 0.4,
          weight: 1,
        })
      },
      onEachFeature: (feature, lyr) => {
        const props = feature.properties as LaborSegmentProps
        lyr.on("click", () => setSelected({ layer: "labor", key: laborKey(props.charge_code, props.mm_from, props.mm_to) }))
      },
    })
    layer.addTo(map)
    laborLayerRef.current = layer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laborSegments, laborStatsByKey, laborMaxHours, visibleLayers])

  function toggleLayer(name: LayerName) {
    setVisibleLayers(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function applyFilters() {
    localStorage.setItem("shared_filter_start", startDate)
    localStorage.setItem("shared_filter_end", endDate)
    localStorage.setItem("shared_filter_crew", crew)
  }

  function resetFilters() {
    setStartDate(""); setEndDate(""); setCrew("")
    localStorage.setItem("shared_filter_start", "")
    localStorage.setItem("shared_filter_end", "")
    localStorage.setItem("shared_filter_crew", "")
  }

  const selectedEquipFeature = selected?.layer === "equipment"
    ? equipSegments?.features.find(f => f.properties.section_id === selected.key)
    : null
  const selectedEquipStats = selectedEquipFeature ? equipSectionStats.get(selected!.key) : null

  useEffect(() => {
    if (selected?.layer === "equipment") {
      console.log(`[CombinedMap] Selection state: layer=equipment key=${selected.key} ` +
                  `featureFound=${!!selectedEquipFeature} equipSegmentsLoaded=${!!equipSegments}`)
    }
  }, [selected, selectedEquipFeature, equipSegments])

  const selectedLaborFeature = selected?.layer === "labor"
    ? laborSegments?.features.find(f => laborKey(f.properties.charge_code, f.properties.mm_from, f.properties.mm_to) === selected.key)
    : null
  const selectedLaborStats = selected?.layer === "labor" ? laborStatsByKey.get(selected.key) : null

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium">Combined Map</h1>
        <button onClick={() => router.push("/upload")} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          Upload new file
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4 p-4 bg-white border border-gray-200 rounded-xl">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Crew</label>
          <select value={crew} onChange={e => setCrew(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800">
            <option value="">All crews</option>
            {crews.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={applyFilters} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">Apply</button>
          <button onClick={resetFilters} className="border border-gray-800 bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-gray-800">Reset</button>
        </div>
      </div>

      {/* Layer toggle — deliberately its own visible control bar, not tucked
          into the map or a menu, and not floating over the map either */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-white border border-gray-200 rounded-xl">
        <span className="text-xs text-gray-500 font-medium mr-1">Show:</span>
        <button
          onClick={() => toggleLayer("labor")}
          disabled={!hasLaborSession}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
            ${visibleLayers.has("labor") ? "bg-orange-50 border-orange-300 text-orange-800" : "bg-white border-gray-300 text-gray-500"}
            ${!hasLaborSession ? "opacity-40 cursor-not-allowed" : "hover:bg-orange-50"}`}
        >
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LABOR_COLOR }} />
          Labor {!hasLaborSession && "(no session loaded)"}
        </button>
        <button
          onClick={() => toggleLayer("equipment")}
          disabled={!hasEquipSession}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
            ${visibleLayers.has("equipment") ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300 text-gray-500"}
            ${!hasEquipSession ? "opacity-40 cursor-not-allowed" : "hover:bg-blue-50"}`}
        >
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: EQUIPMENT_COLOR }} />
          Equipment {!hasEquipSession && "(no session loaded)"}
        </button>
      </div>

      {loadErrors.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {loadErrors.join(" ")}
        </div>
      )}

      {/* Map + persistent side panel — a real flex row, not an overlay, so
          the panel can never end up hidden behind the map */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 640 }}>
          <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
        </div>

        <div className="w-96 flex-shrink-0 bg-white border border-gray-200 rounded-xl flex flex-col" style={{ height: 640 }}>
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">Details</div>
            <div className="text-xs text-gray-400 mt-0.5">Click a road on the map to see it here</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selected && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Nothing selected yet</div>
            )}

            {selectedEquipFeature && (
              <div className="px-4 py-3">
                <div className="text-xs font-semibold text-gray-900">
                  Equipment — Route {selectedEquipFeature.properties.route}, mm {selectedEquipFeature.properties.mm_start} to {selectedEquipFeature.properties.mm_end}
                </div>
                <div className="text-xs text-gray-400 mt-1">{selectedEquipFeature.properties.description}</div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {selectedEquipStats && selectedEquipStats.miles > 0 && (
                    <span className="text-blue-600 font-medium">{selectedEquipStats.miles.toFixed(0)} mi</span>
                  )}
                  {selectedEquipStats && selectedEquipStats.hours > 0 && (
                    <span className="text-green-600 font-medium">{selectedEquipStats.hours.toFixed(1)} hrs</span>
                  )}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Charge codes: {selectedEquipFeature.properties.charge_codes.join(", ")}
                </div>
              </div>
            )}

            {selectedLaborFeature && (
              <div className="px-4 py-3">
                <div className="text-xs font-semibold text-gray-900">
                  Labor — Route {selectedLaborFeature.properties.route}, {selectedLaborFeature.properties.kind === "point"
                    ? `mm ${selectedLaborFeature.properties.mm_from}`
                    : `mm ${selectedLaborFeature.properties.mm_from} to ${selectedLaborFeature.properties.mm_to}`}
                </div>
                <div className="text-xs text-gray-400 mt-1">Charge code: {selectedLaborFeature.properties.charge_code}</div>
                {selectedLaborStats && (
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    {selectedLaborStats.regHours > 0 && (
                      <span className="text-orange-600 font-medium">{selectedLaborStats.regHours.toFixed(1)} reg hrs</span>
                    )}
                    {selectedLaborStats.otHours > 0 && (
                      <span className="text-red-600 font-medium">{selectedLaborStats.otHours.toFixed(1)} OT hrs</span>
                    )}
                  </div>
                )}
                {selectedLaborStats && selectedLaborStats.employees.size > 0 && (
                  <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                    {[...selectedLaborStats.employees.values()].sort((a, b) => a.name.localeCompare(b.name)).map(e => (
                      <div key={e.name} className="py-2">
                        <div className="text-xs font-medium text-gray-800">{e.name}</div>
                        <div className="text-xs text-gray-500">
                          {e.regHours > 0 && `${e.regHours.toFixed(1)} reg`}
                          {e.regHours > 0 && e.otHours > 0 && " · "}
                          {e.otHours > 0 && `${e.otHours.toFixed(1)} OT`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Legend — also always visible, in-flow, bottom of the panel */}
          <div className="px-4 py-3 border-t border-gray-200">
            <div className="text-xs text-gray-400 mb-2">Line/point weight and opacity scale with hours logged</div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LABOR_COLOR }} />
              <span className="text-xs text-gray-600">Labor</span>
              <span className="w-2.5 h-2.5 rounded-sm ml-3" style={{ backgroundColor: EQUIPMENT_COLOR }} />
              <span className="text-xs text-gray-600">Equipment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
