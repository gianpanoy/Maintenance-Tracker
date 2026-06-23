"use client"
import { useState } from "react"
import axios from "axios"
import { useRouter } from "next/navigation"

type ReportType = "employee" | "equipment"

export default function UploadWidget() {
  const [file, setFile] = useState<File | null>(null)
  const [reportType, setReportType] = useState<ReportType>("employee")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", reportType)

      const endpoint =
        reportType === "employee"
          ? "http://localhost:8000/api/upload"
          : "http://localhost:8000/api/upload/equipment"

      const res = await axios.post(endpoint, formData)
      localStorage.setItem("chartData", JSON.stringify(res.data))
      localStorage.setItem("reportType", reportType)
      router.push("/dashboard")
    } catch (err) {
      setError("Upload failed. Make sure the backend is running.")
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
            onClick={() => setReportType("employee")}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
              reportType === "employee"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            Employee
          </button>
          <button
            onClick={() => setReportType("equipment")}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
              reportType === "equipment"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            Equipment
            <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
          </button>
        </div>
      </div>

      {/* File Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center mb-6 transition-colors ${
          file ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300"
        }`}
      >
        <input
          type="file"
          accept=".txt"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="hidden"
          id="file-input"
        />
        <label htmlFor="file-input" className="cursor-pointer">
          {file ? (
            <div>
              <p className="text-blue-600 font-medium">{file.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                {(file.size / 1024).toFixed(1)} KB — click to change
              </p>
            </div>
          ) : (
            <div>
              <p className="text-gray-500">Click to select a <span className="font-medium">.txt</span> file</p>
              <p className="text-xs text-gray-400 mt-1">AS400 fixed-width format</p>
            </div>
          )}
        </label>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 text-sm mb-4">{error}</p>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!file || loading || reportType === "equipment"}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading
          ? "Uploading..."
          : reportType === "equipment"
          ? "Equipment Upload Coming Soon"
          : "Upload & View Dashboard"}
      </button>
    </div>
  )
}
