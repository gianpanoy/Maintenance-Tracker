"use client"
import { useState, useRef } from "react"
import axios from "axios"

type ReportType = "employee" | "equipment"

export default function UploadWidget() {
  const [file, setFile] = useState<File | null>(null)
  const [reportType, setReportType] = useState<ReportType>("employee")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", reportType)

      const endpoint = reportType === "employee"
        ? "http://localhost:8000/api/upload"
        : "http://localhost:8000/api/upload/equipment"

      const res = await axios.post(endpoint, formData)
      const { session_id } = res.data

      if (!session_id) {
        setError("No session ID returned from server")
        return
      }

      if (reportType === "employee") {
        localStorage.setItem("session_id", session_id)
        window.location.href = "/employee"
      } else {
        localStorage.setItem("equipment_session_id", session_id)
        window.location.href = "/equipment"
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Unknown error"
      setError(`Upload failed: ${msg}`)
      console.error("Upload error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-md p-8 max-w-lg w-full">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Upload AS400 Report</h2>

      {/* Report Type Toggle */}
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-600 mb-2">Report Type</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setReportType("employee"); setFile(null); setError(null) }}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
              reportType === "employee"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            Employee
          </button>
          <button
            type="button"
            onClick={() => { setReportType("equipment"); setFile(null); setError(null) }}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
              reportType === "equipment"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            Equipment
          </button>
        </div>
      </div>

      {/* File info banner */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs text-gray-500 font-medium">
          {reportType === "employee" ? "Expected file: SOLABOR.TXT" : "Expected file: SOEQUSE.TXT"}
        </p>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center mb-6 cursor-pointer transition-colors ${
          file
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-blue-300 hover:bg-gray-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={e => {
            setFile(e.target.files?.[0] || null)
            setError(null)
          }}
        />
        {file ? (
          <div>
            <p className="text-blue-600 font-medium">{file.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              {(file.size / 1024).toFixed(1)} KB — click to change
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-500">
              Click to select a <span className="font-medium">.txt</span> file
            </p>
            <p className="text-xs text-gray-400 mt-1">AS400 fixed-width format</p>
          </div>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || loading}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Uploading..." : `Upload ${reportType === "employee" ? "Employee" : "Equipment"} Report`}
      </button>
    </div>
  )
}
