"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import axios from "axios"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import { EquipRow } from "@/components/EquipRow"

// Kauai center + a zoom that keeps the whole island in view
const KAUAI_CENTER: [number, number] = [22.0964, -159.5261]
const DEFAULT_ZOOM = 11

const SEGMENT_COLOR = "#378ADD"

interface SegmentProps {
  section_id: string
  route: number
  mm_start: number
  mm_end: number
  description: string
  charge_codes: string[]
}

interface UnitBreakdown {
  code: string
  desc: string
  miles: number
  hours: number
}

interface ChargeCodeStats {
  miles: number
  hours: number
  units: Map<string, UnitBreakdown>
}

interface Props {
  active: EquipRow[]
}

export default function EquipmentMap({ active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.GeoJSON | null>(null)

  const [segments, setSegments] = useState<FeatureCollection<Geometry, SegmentProps> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)

  useEffect(() => {
    axios.get("http://localhost:8000/api/gis/segments")
      .then(res => {
        console.log(`[EquipmentMap] Loaded ${res.data?.features?.length ?? 0} road segment(s) from /api/gis/segments`)
        setSegments(res.data)
      })
      .catch(err => {
        console.error("[EquipmentMap] Failed to fetch /api/gis/segments:", err)
        setLoadError("Couldn't load road segment data. Run build_segments.py and " +
                      "copy charge_segments.geojson into app/data/ first.")
      })
  }, [])

  // Aggregate the currently-filtered equipment data by Charge Code — same
  // pattern as the calendar's usageByDay: derive from `active` client side.
  // Pure data logic, no Leaflet involved — unchanged from the react-leaflet version.
  const statsByChargeCode = useMemo(() => {
    const map = new Map<string, ChargeCodeStats>()
    active.forEach(r => {
      r.rawRows.forEach((row: any) => {
        const code = String(row["Charge Code"] || "").trim()
        if (!code) return
        if (!map.has(code)) map.set(code, { miles: 0, hours: 0, units: new Map() })
        const stats = map.get(code)!
        const miles = Number(row["Run Miles"]) || 0
        const hours = Number(row["Run Hours"]) || 0
        stats.miles += miles
        stats.hours += hours
        if (!stats.units.has(r.code)) stats.units.set(r.code, { code: r.code, desc: r.desc, miles: 0, hours: 0 })
        const unit = stats.units.get(r.code)!
        unit.miles += miles
        unit.hours += hours
      })
    })
    return map
  }, [active])

  const sectionStats = useMemo(() => {
    const map = new Map<string, { miles: number; hours: number; units: Map<string, UnitBreakdown> }>()
    if (!segments) return map
    segments.features.forEach(f => {
      const props = f.properties as SegmentProps
      const combined = { miles: 0, hours: 0, units: new Map<string, UnitBreakdown>() }
      props.charge_codes.forEach(code => {
        const stats = statsByChargeCode.get(code)
        if (!stats) return
        combined.miles += stats.miles
        combined.hours += stats.hours
        stats.units.forEach((u, unitCode) => {
          if (!combined.units.has(unitCode)) combined.units.set(unitCode, { ...u })
          else {
            const existing = combined.units.get(unitCode)!
            existing.miles += u.miles
            existing.hours += u.hours
          }
        })
      })
      map.set(props.section_id, combined)
    })
    return map
  }, [segments, statsByChargeCode])

  const maxHours = useMemo(() => {
    let max = 0
    sectionStats.forEach(s => { if (s.hours > max) max = s.hours })
    return max
  }, [sectionStats])

  const unmappedCodes = useMemo(() => {
    if (!segments) return []
    const mapped = new Set<string>()
    segments.features.forEach(f => (f.properties as SegmentProps).charge_codes.forEach(c => mapped.add(c)))
    return [...statsByChargeCode.keys()].filter(c => !mapped.has(c)).sort()
  }, [segments, statsByChargeCode])

  function styleFeature(feature?: Feature<Geometry, SegmentProps>): L.PathOptions {
    if (!feature) return {}
    const stats = sectionStats.get(feature.properties.section_id)
    const hasData = stats && (stats.hours > 0 || stats.miles > 0)
    const intensity = hasData && maxHours > 0 ? Math.min(1, stats!.hours / maxHours) : 0
    return {
      color: SEGMENT_COLOR,
      weight: hasData ? 4 + intensity * 3 : 3,
      opacity: hasData ? 0.5 + intensity * 0.5 : 0.4,
    }
  }

  // Create the map exactly once, on mount. Only runs client-side (useEffect
  // never fires during SSR), so this is safe even though Leaflet touches
  // the DOM directly — no React-component wrapping involved at all.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: KAUAI_CENTER,
      zoom: DEFAULT_ZOOM,
    })
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // (Re)build the GeoJSON layer whenever the segment data or styling
  // inputs change. Removing and re-adding is simpler and cheap enough at
  // this scale (22 features) rather than diffing individual feature styles.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !segments) return

    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }

    const layer = L.geoJSON(segments as any, {
      style: (feature) => styleFeature(feature as Feature<Geometry, SegmentProps>),
      onEachFeature: (feature, lyr) => {
        lyr.on("click", () => setSelectedSection((feature.properties as SegmentProps).section_id))
      },
    })
    layer.addTo(map)
    layerRef.current = layer

    // Frame the map to whatever data actually loaded, rather than trusting
    // a hardcoded center/zoom — removes "technically loaded but off-screen
    // or zoomed wrong" as a possible cause of an apparently-blank map.
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }

    const sectionsWithData = [...sectionStats.values()].filter(s => s.hours > 0 || s.miles > 0).length
    console.log(`[EquipmentMap] Rendered ${segments.features.length} segment(s), ` +
                `${sectionsWithData} with non-zero usage for the current filter, ` +
                `${statsByChargeCode.size} distinct charge code(s) present in filtered data`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, sectionStats, maxHours])

  const selectedFeature = segments?.features.find(f => f.properties.section_id === selectedSection)
  const selectedStats = selectedSection ? sectionStats.get(selectedSection) : undefined
  const selectedUnits = selectedStats ? [...selectedStats.units.values()].sort((a, b) => a.code.localeCompare(b.code)) : []

  return (
    <div className="relative">
      {loadError && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {loadError}
        </div>
      )}

      {unmappedCodes.length > 0 && (
        <div className="mb-4 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
          {unmappedCodes.length} charge code{unmappedCodes.length !== 1 ? "s" : ""} in the current filter
          {" "}{unmappedCodes.length !== 1 ? "aren't" : "isn't"} mapped to a road section yet: {unmappedCodes.join(", ")}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 600 }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Intensity legend */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-gray-400">Less usage</span>
        {[0.5, 0.65, 0.8, 0.9, 1].map((op, i) => (
          <div key={i} className="w-4 h-1.5 rounded-sm" style={{ backgroundColor: SEGMENT_COLOR, opacity: op }} />
        ))}
        <span className="text-xs text-gray-400">More usage</span>
      </div>

      {/* Section detail drawer — same pattern as the calendar's day drawer */}
      {selectedSection && selectedFeature && (
        <>
          <div className="fixed inset-0 bg-black/10 z-30" onClick={() => setSelectedSection(null)} />
          <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  Route {selectedFeature.properties.route} — mm {selectedFeature.properties.mm_start} to {selectedFeature.properties.mm_end}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 truncate">{selectedFeature.properties.description}</div>
              </div>
              <button
                onClick={() => setSelectedSection(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 text-xs">
              {selectedStats && selectedStats.miles > 0 && (
                <span className="text-blue-600 font-medium">{selectedStats.miles.toFixed(0)} mi</span>
              )}
              {selectedStats && selectedStats.hours > 0 && (
                <span className="text-green-600 font-medium">{selectedStats.hours.toFixed(1)} hrs</span>
              )}
              <span className="text-gray-400">{selectedFeature.properties.charge_codes.length} charge code(s)</span>
            </div>

            <div className="px-4 py-2 border-b border-gray-100">
              <div className="text-xs text-gray-500">
                Charge codes: {selectedFeature.properties.charge_codes.join(", ")}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {selectedUnits.map(u => (
                <div key={u.code} className="px-4 py-3">
                  <div className="text-xs font-semibold text-gray-900">{u.code}</div>
                  <div className="text-xs text-gray-400 truncate">{u.desc}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    {u.miles > 0 && <span className="text-blue-600 font-medium">{u.miles.toFixed(0)} mi</span>}
                    {u.hours > 0 && <span className="text-green-600 font-medium">{u.hours.toFixed(1)} hrs</span>}
                  </div>
                </div>
              ))}
              {selectedUnits.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  No activity on this section for the current filter
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
