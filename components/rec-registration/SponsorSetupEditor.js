"use client"

import { Button, Col, Form, Row } from "@/components/ui/portal-kit"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faEyeSlash, faPlus, faStar, faTrash, faUpload } from "@fortawesome/free-solid-svg-icons"
import {
  DEFAULT_SPONSOR_CATEGORIES,
  createSponsorCategoryDraft,
  createSponsorDraft,
} from "@/lib/appwrite/rec-sponsors"

const itemKey = (item) => item.$id || item.localId

export default function SponsorSetupEditor({
  categories = [],
  sponsors = [],
  logoFilesBySponsor = {},
  onCategoriesChange,
  onSponsorsChange,
  onLogoFileChange,
}) {
  const visibleCategories = categories.filter((category) => !category._delete)
  const visibleSponsors = sponsors.filter((sponsor) => !sponsor._delete)

  const updateCategory = (categoryId, patch) => {
    onCategoriesChange(
      categories.map((category) =>
        itemKey(category) === categoryId ? { ...category, ...patch } : category
      )
    )
  }

  const updateSponsor = (sponsorId, patch) => {
    onSponsorsChange(
      sponsors.map((sponsor) =>
        itemKey(sponsor) === sponsorId ? { ...sponsor, ...patch } : sponsor
      )
    )
  }

  const addCategory = (overrides = {}) => {
    onCategoriesChange([
      ...categories,
      createSponsorCategoryDraft({
        displayOrder: visibleCategories.length + 1,
        ...overrides,
      }),
    ])
  }

  const addDefaultCategories = () => {
    const existingNames = new Set(visibleCategories.map((category) => category.name.toLowerCase()))
    const additions = DEFAULT_SPONSOR_CATEGORIES
      .filter((category) => !existingNames.has(category.name.toLowerCase()))
      .map((category, index) =>
        createSponsorCategoryDraft({
          ...category,
          displayOrder: visibleCategories.length + index + 1,
        })
      )

    if (additions.length > 0) {
      onCategoriesChange([...categories, ...additions])
    }
  }

  const removeCategory = (categoryId) => {
    onCategoriesChange(
      categories.map((category) =>
        itemKey(category) === categoryId ? { ...category, _delete: true } : category
      )
    )
    onSponsorsChange(
      sponsors.map((sponsor) =>
        sponsor.categoryId === categoryId ? { ...sponsor, categoryId: "" } : sponsor
      )
    )
  }

  const addSponsor = () => {
    onSponsorsChange([
      ...sponsors,
      createSponsorDraft({
        categoryId: visibleCategories[0] ? itemKey(visibleCategories[0]) : "",
        displayOrder: visibleSponsors.length + 1,
      }),
    ])
  }

  const removeSponsor = (sponsorId) => {
    onSponsorsChange(
      sponsors.map((sponsor) =>
        itemKey(sponsor) === sponsorId ? { ...sponsor, _delete: true } : sponsor
      )
    )
  }

  return (
    <div className="d-flex flex-column gap-4">
      <div>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h6 className="mb-1 fw-bold text-dark">Sponsor Categories</h6>
            <p className="text-muted small mb-0">Create tiers such as Gold, Silver, Strategic Partner, or Media Partner.</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Button variant="outline-secondary" size="sm" type="button" onClick={addDefaultCategories}>
              Add Standard Tiers
            </Button>
            <Button variant="outline-primary" size="sm" type="button" onClick={() => addCategory()}>
              <FontAwesomeIcon icon={faPlus} className="me-2" />
              Add Category
            </Button>
          </div>
        </div>

        {visibleCategories.length === 0 ? (
          <div className="p-3 bg-light border rounded text-muted small">
            No sponsor categories added yet. Sponsors can still be added as uncategorized.
          </div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {visibleCategories.map((category, index) => {
              const categoryId = itemKey(category)
              return (
                <div key={categoryId} className="p-3 bg-light rounded border">
                  <Row className="g-3 align-items-end">
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Category Name</Form.Label>
                        <Form.Control
                          value={category.name || ""}
                          onChange={(event) => updateCategory(categoryId, { name: event.target.value })}
                          placeholder="Gold"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={2}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Order</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          value={category.displayOrder ?? index + 1}
                          onChange={(event) => updateCategory(categoryId, { displayOrder: parseInt(event.target.value, 10) || 0 })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={2}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Color</Form.Label>
                        <div className="d-flex gap-2">
                          <Form.Control
                            type="color"
                            value={category.accentColor || "#2E9ECC"}
                            onChange={(event) => updateCategory(categoryId, { accentColor: event.target.value })}
                            style={{ width: 48, height: 38, padding: 2 }}
                          />
                          <Form.Control
                            value={category.accentColor || ""}
                            onChange={(event) => updateCategory(categoryId, { accentColor: event.target.value })}
                            placeholder="#2E9ECC"
                          />
                        </div>
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Description</Form.Label>
                        <Form.Control
                          value={category.description || ""}
                          onChange={(event) => updateCategory(categoryId, { description: event.target.value })}
                          placeholder="Optional public label"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={2}>
                      <div className="d-flex align-items-center justify-content-md-end gap-2">
                        <Form.Check
                          type="switch"
                          id={`category-active-${categoryId}`}
                          label="Visible"
                          checked={category.isActive !== false}
                          onChange={(event) => updateCategory(categoryId, { isActive: event.target.checked })}
                        />
                        <Button variant="outline-danger" size="sm" type="button" onClick={() => removeCategory(categoryId)}>
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </div>
                    </Col>
                  </Row>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-top pt-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h6 className="mb-1 fw-bold text-dark">Sponsors</h6>
            <p className="text-muted small mb-0">Upload a logo or provide a logo URL. Uploaded logos take priority when saved.</p>
          </div>
          <Button variant="outline-primary" size="sm" type="button" onClick={addSponsor}>
            <FontAwesomeIcon icon={faPlus} className="me-2" />
            Add Sponsor
          </Button>
        </div>

        {visibleSponsors.length === 0 ? (
          <div className="p-3 bg-light border rounded text-muted small">
            No sponsors have been added to this conference yet.
          </div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {visibleSponsors.map((sponsor, index) => {
              const sponsorId = itemKey(sponsor)
              const selectedFile = logoFilesBySponsor[sponsorId]
              return (
                <div key={sponsorId} className="p-3 rounded border" style={{ background: "#fff" }}>
                  <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                    <div className="d-flex align-items-center gap-3">
                      {sponsor.logoUrl ? (
                        <img
                          src={sponsor.logoUrl}
                          alt={`${sponsor.name || "Sponsor"} logo`}
                          style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc" }}
                        />
                      ) : (
                        <div className="d-flex align-items-center justify-content-center text-muted" style={{ width: 64, height: 64, borderRadius: 8, border: "1px dashed #cbd5e1", background: "#f8fafc" }}>
                          Logo
                        </div>
                      )}
                      <div>
                        <strong>{sponsor.name || `Sponsor ${index + 1}`}</strong>
                        <div className="d-flex flex-wrap gap-2 mt-1">
                          {sponsor.isFeatured && <span className="badge bg-warning text-dark"><FontAwesomeIcon icon={faStar} className="me-1" /> Featured</span>}
                          {sponsor.isActive === false && <span className="badge bg-secondary"><FontAwesomeIcon icon={faEyeSlash} className="me-1" /> Hidden</span>}
                        </div>
                      </div>
                    </div>
                    <Button variant="outline-danger" size="sm" type="button" onClick={() => removeSponsor(sponsorId)}>
                      <FontAwesomeIcon icon={faTrash} />
                    </Button>
                  </div>

                  <Row className="g-3">
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Sponsor Name</Form.Label>
                        <Form.Control
                          value={sponsor.name || ""}
                          onChange={(event) => updateSponsor(sponsorId, { name: event.target.value })}
                          placeholder="Organization name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Category</Form.Label>
                        <Form.Select
                          value={sponsor.categoryId || ""}
                          onChange={(event) => updateSponsor(sponsorId, { categoryId: event.target.value })}
                        >
                          <option value="">Uncategorized</option>
                          {visibleCategories.map((category) => (
                            <option key={itemKey(category)} value={itemKey(category)}>{category.name || "Untitled category"}</option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={2}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Order</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          value={sponsor.displayOrder ?? index + 1}
                          onChange={(event) => updateSponsor(sponsorId, { displayOrder: parseInt(event.target.value, 10) || 0 })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <div className="d-flex gap-3 pt-md-4">
                        <Form.Check
                          type="switch"
                          id={`sponsor-active-${sponsorId}`}
                          label="Visible"
                          checked={sponsor.isActive !== false}
                          onChange={(event) => updateSponsor(sponsorId, { isActive: event.target.checked })}
                        />
                        <Form.Check
                          type="switch"
                          id={`sponsor-featured-${sponsorId}`}
                          label="Featured"
                          checked={Boolean(sponsor.isFeatured)}
                          onChange={(event) => updateSponsor(sponsorId, { isFeatured: event.target.checked })}
                        />
                      </div>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Website Link</Form.Label>
                        <Form.Control
                          type="url"
                          value={sponsor.siteUrl || ""}
                          onChange={(event) => updateSponsor(sponsorId, { siteUrl: event.target.value })}
                          placeholder="https://example.com"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Logo URL</Form.Label>
                        <Form.Control
                          type="url"
                          value={sponsor.logoUrl || ""}
                          onChange={(event) => updateSponsor(sponsorId, { logoUrl: event.target.value })}
                          placeholder="https://example.com/logo.png"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Upload Logo</Form.Label>
                        <Form.Control
                          type="file"
                          accept="image/*"
                          onChange={(event) => onLogoFileChange(sponsorId, event.target.files?.[0] || null)}
                        />
                        <Form.Text className="text-muted">
                          <FontAwesomeIcon icon={faUpload} className="me-1" />
                          {selectedFile ? selectedFile.name : "PNG, JPG, SVG, or WebP recommended."}
                        </Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Description</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={sponsor.description || ""}
                          onChange={(event) => updateSponsor(sponsorId, { description: event.target.value })}
                          placeholder="Public sponsor description"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Contact Person</Form.Label>
                        <Form.Control
                          value={sponsor.contactPerson || ""}
                          onChange={(event) => updateSponsor(sponsorId, { contactPerson: event.target.value })}
                          placeholder="Internal contact"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Contact Email</Form.Label>
                        <Form.Control
                          type="email"
                          value={sponsor.contactEmail || ""}
                          onChange={(event) => updateSponsor(sponsorId, { contactEmail: event.target.value })}
                          placeholder="contact@example.com"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small text-muted">Internal Notes</Form.Label>
                        <Form.Control
                          value={sponsor.internalNotes || ""}
                          onChange={(event) => updateSponsor(sponsorId, { internalNotes: event.target.value })}
                          placeholder="Admin-only notes"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
