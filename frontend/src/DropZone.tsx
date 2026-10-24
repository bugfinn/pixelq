import { useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  disabled: boolean
}

export function DropZone({ onFiles, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  return (
    <>
      <div
        className={`dropzone${dragging ? ' dropzone-active' : ''}${disabled ? ' dropzone-disabled' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) inputRef.current?.click()
        }}
        onKeyDown={handleKey}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <p className="dropzone-title">
          {disabled ? 'Uploading…' : 'Drop images here, or click to choose'}
        </p>
        <p className="dropzone-hint">JPEG, PNG, WebP | up to 10 MB each</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = '' // lets the same file be chosen again later
          if (files.length > 0) onFiles(files)
        }}
      />
    </>
  )
}