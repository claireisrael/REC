"use client"

import { useEffect, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons"

export default function RecConfirmDialog({
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  onClose,
  onConfirm,
}) {
  const [submitting, setSubmitting] = useState(false)
  const locked = busy || submitting

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !locked) onClose?.()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [locked, onClose])

  const handleConfirm = async () => {
    if (locked) return
    setSubmitting(true)
    try {
      await onConfirm?.()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rec-modal-backdrop rec-confirm-backdrop" role="presentation">
      <div
        className="rec-modal rec-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rec-confirm-title"
      >
        <div className="rec-modal-header rec-modal-header-flex">
          <h3 id="rec-confirm-title" className="rec-modal-title rec-modal-title-dark">{title}</h3>
          <button
            type="button"
            className="rec-icon-button"
            onClick={onClose}
            disabled={locked}
            aria-label={`Close ${title}`}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="rec-modal-body rec-confirm-body">{children}</div>
        <div className="rec-modal-footer">
          <button type="button" className="rec-btn rec-btn-outline" onClick={onClose} disabled={locked}>
            {cancelLabel}
          </button>
          <button type="button" className="rec-btn rec-btn-accent" onClick={handleConfirm} disabled={locked}>
            {locked ? <FontAwesomeIcon icon={faSpinner} spin /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
