"use client"

import { Form } from "@/components/ui/portal-kit"
import {
  REC_PARTICIPANT_CATEGORIES,
  getRecOptionalSessionCopy,
  getRecParticipantCategoryValue,
} from "@/lib/rec-conference/registration-tracks.mjs"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"

export default function RecOptionalSessionsFields({
  year,
  selected = [],
  onChange,
  idPrefix = "participant-category",
}) {
  const copy = getRecOptionalSessionCopy()
  const edition = formatRecEdition(year)
  const selectedCategory = getRecParticipantCategoryValue(selected)

  return (
    <Form.Group className="mb-3">
      <Form.Label>{copy.label} *</Form.Label>
      <p className="text-muted small mb-2">{copy.intro}</p>
      <div className="d-flex flex-column gap-2">
        {REC_PARTICIPANT_CATEGORIES.map((category) => (
          <Form.Check
            key={category.value}
            type="radio"
            name={idPrefix}
            id={`${idPrefix}-${category.value}`}
            checked={selectedCategory === category.value}
            onChange={() => onChange([...category.sessions])}
            label={<span className="fw-semibold">{category.getLabel(edition)}</span>}
          />
        ))}
      </div>
    </Form.Group>
  )
}
