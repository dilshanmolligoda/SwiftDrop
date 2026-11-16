import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { CheckCircle2, ImagePlus, Loader2, RotateCcw, Trash2, UploadCloud, X } from 'lucide-react'
import type { ApiError } from '../../../api/client'
import { useApiErrorHandler } from '../hooks/useApiErrorHandler'
import { courierApi } from '../services/courierApi'
import type { ProofMetadata } from '../types/courier.types'
import { formatBytes, formatDateTime } from '../utils/format'
import { PROOF_ACCEPT, validateProofFile } from '../utils/proofValidation'
import { ErrorAlert } from './StateViews'

type UploadPhase = 'idle' | 'uploading' | 'uploaded' | 'failed'

interface ProofUploaderProps {
  readonly parcelId: string
  readonly uploadedProof: ProofMetadata | null
  readonly onUploaded: (proof: ProofMetadata) => void
  readonly onCleared: () => void
  readonly disabled?: boolean
}

export function ProofUploader({ parcelId, uploadedProof, onUploaded, onCleared, disabled }: ProofUploaderProps) {
  const inputId = useId()
  const handleError = useApiErrorHandler()
  const abortRef = useRef<AbortController | null>(null)
  const previewRef = useRef<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [phase, setPhase] = useState<UploadPhase>(uploadedProof ? 'uploaded' : 'idle')
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState<ApiError | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Release the preview and cancel any upload when leaving the page.
  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  const replacePreview = (next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = next ? URL.createObjectURL(next) : null
    setPreviewUrl(previewRef.current)
  }

  const selectFile = (next: File | undefined) => {
    if (!next) return
    setUploadError(null)
    setProgress(0)
    const error = validateProofFile(next)
    setValidationError(error)
    if (error) {
      setFile(null)
      replacePreview(null)
      setPhase('idle')
      return
    }
    setFile(next)
    replacePreview(next)
    setPhase('idle')
    if (uploadedProof) onCleared()
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0])
    // Allow choosing the same file again after removing it.
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (!disabled) selectFile(event.dataTransfer.files[0])
  }

  const clearSelection = () => {
    abortRef.current?.abort()
    setFile(null)
    replacePreview(null)
    setValidationError(null)
    setUploadError(null)
    setProgress(0)
    setPhase('idle')
    if (uploadedProof) onCleared()
  }

  const upload = async () => {
    if (!file || phase === 'uploading') return
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('uploading')
    setUploadError(null)
    setProgress(0)

    try {
      const proof = await courierApi.uploadProof(parcelId, file, {
        signal: controller.signal,
        onProgress: setProgress,
      })
      setProgress(100)
      setPhase('uploaded')
      onUploaded(proof)
    } catch (error) {
      const apiError = handleError(error)
      // A null error means the user cancelled; cancelUpload already reset the state.
      if (!apiError) return
      setUploadError(apiError)
      setPhase('failed')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const cancelUpload = () => {
    abortRef.current?.abort()
    setProgress(0)
    setPhase('idle')
  }

  const isUploading = phase === 'uploading'
  const isUploaded = phase === 'uploaded' && uploadedProof !== null

  return (
    <div className="cp-proof">
      {!file && !isUploaded && (
        <label
          htmlFor={inputId}
          className={`cp-dropzone ${isDragging ? 'cp-dropzone--active' : ''} ${disabled ? 'cp-dropzone--disabled' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            id={inputId}
            type="file"
            accept={PROOF_ACCEPT}
            className="cp-sr-only"
            onChange={handleInputChange}
            disabled={disabled}
            aria-describedby={`${inputId}-hint`}
            aria-invalid={validationError ? true : undefined}
          />
          <span className="cp-dropzone__icon" aria-hidden="true">
            <ImagePlus />
          </span>
          <span className="cp-dropzone__title">Take or choose a proof photo</span>
          <span id={`${inputId}-hint`} className="cp-dropzone__hint">
            JPEG, PNG or WebP · up to 5 MB
          </span>
        </label>
      )}

      {validationError && (
        <p className="cp-field__error cp-proof__validation" role="alert">
          {validationError}
        </p>
      )}

      {(file || isUploaded) && (
        <div className={`cp-proof__preview-card ${isUploaded ? 'cp-proof__preview-card--done' : ''}`}>
          {previewUrl ? (
            <img src={previewUrl} alt="Selected proof of delivery" className="cp-proof__image" />
          ) : (
            <span className="cp-proof__image cp-proof__image--placeholder" aria-hidden="true">
              <CheckCircle2 />
            </span>
          )}

          <div className="cp-proof__info">
            <p className="cp-proof__name" title={uploadedProof?.originalFilename ?? file?.name}>
              {isUploaded ? uploadedProof.originalFilename : file?.name}
            </p>
            <p className="cp-proof__meta">
              {isUploaded
                ? `${formatBytes(uploadedProof.sizeBytes)} · uploaded ${formatDateTime(uploadedProof.uploadedAt)}`
                : file && formatBytes(file.size)}
            </p>

            {isUploading && (
              <div className="cp-proof__progress">
                <div
                  className="cp-proof__progress-track"
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <span className="cp-proof__progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="cp-proof__progress-value" aria-live="polite">
                  {progress}%
                </span>
              </div>
            )}

            {isUploaded && (
              <p className="cp-proof__success" role="status">
                <CheckCircle2 aria-hidden="true" />
                Proof uploaded successfully
              </p>
            )}

            <div className="cp-proof__actions">
              {!isUploaded && !isUploading && (
                <button
                  type="button"
                  className="cp-btn cp-btn--sm"
                  onClick={() => void upload()}
                  disabled={disabled}
                >
                  {phase === 'failed' ? <RotateCcw aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
                  {phase === 'failed' ? 'Retry upload' : 'Upload photo'}
                </button>
              )}
              {isUploading && (
                <>
                  <span className="cp-proof__uploading">
                    <Loader2 className="cp-spin" aria-hidden="true" />
                    Uploading…
                  </span>
                  <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={cancelUpload}>
                    <X aria-hidden="true" />
                    Cancel
                  </button>
                </>
              )}
              {!isUploading && (
                <button
                  type="button"
                  className="cp-btn cp-btn--ghost cp-btn--sm"
                  onClick={clearSelection}
                  disabled={disabled}
                >
                  <Trash2 aria-hidden="true" />
                  {isUploaded ? 'Replace photo' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {uploadError && <ErrorAlert error={uploadError} />}
    </div>
  )
}
