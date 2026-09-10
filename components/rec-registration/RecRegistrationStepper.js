"use client"

import "./rec-registration-form.css"

export const REC_REGISTRATION_STEPS = [
  { id: "you", label: "About you" },
  { id: "organization", label: "Organization" },
  { id: "attendance", label: "Attendance" },
  { id: "review", label: "Review" },
]

export function RecRegistrationReviewList({ items = [] }) {
  return (
    <dl className="rec-reg-review">
      {items.map((item) => (
        <div key={item.label} className="rec-reg-review-row">
          <dt>{item.label}</dt>
          <dd>{item.value || "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function RecRegistrationStepper({
  steps = REC_REGISTRATION_STEPS,
  current = 0,
  onSelect,
}) {
  return (
    <ol className="rec-reg-steps" aria-label="Registration steps">
      {steps.map((step, index) => {
        const status = index === current ? "current" : index < current ? "done" : "upcoming"
        const clickable = typeof onSelect === "function" && index < current
        return (
          <li key={step.id} className={`rec-reg-step rec-reg-step--${status}`}>
            <button
              type="button"
              className="rec-reg-step-btn"
              disabled={!clickable}
              onClick={() => clickable && onSelect(index)}
            >
              <span className="rec-reg-step-num">{index < current ? "✓" : index + 1}</span>
              <span className="rec-reg-step-label">{step.label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
