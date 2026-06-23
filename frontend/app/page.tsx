import UploadWidget from "@/components/UploadWidget"

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Maintenance Tracker</h1>
      <p className="text-gray-500 mb-8">Upload your AS400 report to view the dashboard</p>
      <UploadWidget />
    </div>
  )
}
