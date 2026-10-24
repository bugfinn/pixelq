import { formatBytes, formatPercent, statusLabel } from './format'
import { sizeSummary } from './job-view'
import type { Job } from './types'

export function JobCard({ job }: { job: Job }) {
  const summary = sizeSummary(job)

  return (
    <li className="card">
      <div className="card-row">
        <span className="card-name" title={job.originalName}>
          {job.originalName}
        </span>
        <span className={`badge badge-${job.status}`}>{statusLabel(job.status)}</span>
      </div>

      {job.status === 'done' && (
        <>
          {summary && (
            <p className="card-sizes">
              {formatBytes(summary.from)} → {formatBytes(summary.to)}
              {summary.change !== null && ` (${formatPercent(summary.change)})`}
            </p>
          )}
          <div className="variants">
            {job.outputs.map((output) => (
              <a key={output.variant} className="variant" href={`${output.url}?download=1`}>
                <strong>{output.variant}</strong>
                <span>
                  {output.width}×{output.height} · {formatBytes(output.sizeBytes)}
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      {/* The API's own message: the reason for a failure, or "retrying" between attempts. */}
      {job.error && (
        <p className={job.status === 'failed' ? 'card-error' : 'card-note'}>{job.error}</p>
      )}
    </li>
  )
}