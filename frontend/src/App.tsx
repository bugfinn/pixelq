import { DropZone } from './DropZone'
import { JobCard } from './JobCard'
import { summarizeJobs, visibleJobs } from './job-view'
import { useJobs } from './useJobs'

export default function App() {
  const { jobs, loaded, offline, uploadingName, notices, addFiles, dismissNotice } = useJobs()
  const shown = visibleJobs(jobs)
  const { inProgress, failed } = summarizeJobs(jobs)

  return (
    <main className="page">
      <header className="header">
        <h1>PixelQ</h1>
        <p className="counts">
          in progress {inProgress} | failed {failed}
        </p>
      </header>

      <DropZone onFiles={(files) => void addFiles(files)} disabled={uploadingName !== null} />

      {uploadingName && <p className="status-line">Uploading {uploadingName}…</p>}
      {offline && (
        <p className="notice notice-error" role="alert">
          Can't reach the server.
        </p>
      )}
      {notices.map((notice) => (
        <p key={notice.id} className="notice notice-error" role="alert">
          <span>{notice.text}</span>
          <button type="button" onClick={() => dismissNotice(notice.id)} aria-label="Dismiss">
            ×
          </button>
        </p>
      ))}

      <ul className="cards">
        {shown.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </ul>
      {loaded && shown.length === 0 && <p className="empty">No images yet.</p>}

      <p className="footer">Results are deleted 24 hours after a job finishes.</p>
    </main>
  )
}