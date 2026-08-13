"use client"

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-blue-400 flex-shrink-0">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// TODO: replace these three placeholders with your real info
const EMAIL = "gianpanoy18@gmail.com"
const LINKEDIN_URL = "https://linkedin.com/in/gianpanoy"
const LINKEDIN_LABEL = "linkedin.com/in/gianpanoy"
const GITHUB_URL = "https://github.com/gianpanoy/Maintenance-Tracker"
const GITHUB_LABEL = "github.com/gianpanoy/Maintenance-Tracker"

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-black mb-6">Contact</h1>

        {/* About Me + Contact — one combined block */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">About Me</h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            This was a Summer Intern project created by me. Mahalo to Eric, Randall, Joel
            for this project and also my time here at Highways Kauai.
          </p>

          <div className="my-5 border-t border-gray-100" />

          <h2 className="text-sm font-semibold text-gray-900 mb-1">Get in Touch</h2>
          <p className="text-sm text-gray-600 mb-4">
            Contact for any issues or questions, feel free to reach out at{" "}
            <a href={`mailto:${EMAIL}`} className="text-blue-600 hover:underline">{EMAIL}</a>.
          </p>

          <div className="flex flex-col gap-2">
            <a
              href={`mailto:${EMAIL}`}
              className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 hover:bg-blue-100 transition-colors"
            >
              <div>
                <div className="text-xs text-blue-700/70">Email</div>
                <div className="text-sm text-gray-800">{EMAIL}</div>
              </div>
              <ArrowIcon />
            </a>

            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 hover:bg-blue-100 transition-colors"
            >
              <div>
                <div className="text-xs text-blue-700/70">LinkedIn</div>
                <div className="text-sm text-gray-800">{LINKEDIN_LABEL}</div>
              </div>
              <ArrowIcon />
            </a>

            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 hover:bg-blue-100 transition-colors"
            >
              <div>
                <div className="text-xs text-blue-700/70">GitHub Repo</div>
                <div className="text-sm text-gray-800">{GITHUB_LABEL}</div>
              </div>
              <ArrowIcon />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
