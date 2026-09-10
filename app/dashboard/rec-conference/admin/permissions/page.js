"use client"

import { useState, useEffect } from "react"
import { Container, Row, Col, Card, Alert, Button, Breadcrumb, Table, Modal, Form, Badge, Spinner } from "@/components/ui/portal-kit"
import { useAuth } from "@/lib/auth/auth-provider"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faUserShield, faHome, faArrowLeft, faPlus, faEdit, faTrash, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import {
  deleteModulePermission,
  fetchModulePermissionUsers,
  saveModulePermission
} from "@/lib/auth/module-permissions-api-client"

export default function RecPermissionsPage() {
  const {
    user,
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES,
    PERMISSION_LEVELS: AUTH_PERMISSION_LEVELS
  } = useAuth()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [permissions, setPermissions] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingPermission, setEditingPermission] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedPermissionLevel, setSelectedPermissionLevel] = useState("VIEWER")
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [permissionToRemove, setPermissionToRemove] = useState(null)
  const [removingPermission, setRemovingPermission] = useState(false)

  // Check permissions
  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'manage')
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)

        const response = await fetchModulePermissionUsers(MODULES.REC_CONFERENCE)
        setUsers(Array.isArray(response.users) ? response.users : [])
        setPermissions(Array.isArray(response.permissions) ? response.permissions : [])

      } catch (err) {
        console.error("Error loading data:", err)
        setError("Error loading users and permissions. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [MODULES.REC_CONFERENCE])

  // Permission checks
  if (!hasRecAccess && !isSeniorManager()) {
    return (
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col md={8}>
            <Alert variant="warning" className="text-center">
              <FontAwesomeIcon icon={faExclamationTriangle} size="3x" className="mb-3" />
              <h4>Access Restricted</h4>
              <p>You don't have permission to access REC Conference permissions.</p>
              <Link href="/dashboard/rec-conference" className="btn btn-primary">
                <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
                Back to REC Conference
              </Link>
            </Alert>
          </Col>
        </Row>
      </Container>
    )
  }

  if (!canManageRec && !isSeniorManager()) {
    return (
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col md={8}>
            <Alert variant="info" className="text-center">
              <FontAwesomeIcon icon={faUserShield} size="3x" className="mb-3" />
              <h4>Insufficient Access</h4>
              <p>You have <strong>{userPermissionLevel}</strong> access to REC Conference.</p>
              <p>User permission management requires ADMIN level access or higher.</p>
              <Link href="/dashboard/rec-conference" className="btn btn-primary">
                <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
                Back to REC Conference
              </Link>
            </Alert>
          </Col>
        </Row>
      </Container>
    )
  }

  if (loading) {
    return (
      <Container className="py-5">
        <div className="text-center">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3">Loading user permissions...</p>
        </div>
      </Container>
    )
  }

  const handleAddPermission = () => {
    setEditingPermission(null)
    setSelectedUserId("")
    setSelectedPermissionLevel("VIEWER")
    setShowModal(true)
  }

  const handleEditPermission = (permission) => {
    setEditingPermission(permission)
    setSelectedUserId(permission.userId)
    setSelectedPermissionLevel(permission.permissions)
    setShowModal(true)
  }

  const handleSavePermission = async () => {
    if (!selectedUserId || !selectedPermissionLevel) {
      setError("Please select a user and permission level")
      return
    }

    try {
      setSaving(true)
      setError(null)

      // Use setUserModulePermission for both create and update
      await saveModulePermission(MODULES.REC_CONFERENCE, selectedUserId, selectedPermissionLevel)

      // Reload permissions
      const response = await fetchModulePermissionUsers(MODULES.REC_CONFERENCE)
      setPermissions(Array.isArray(response.permissions) ? response.permissions : [])

      setShowModal(false)
    } catch (err) {
      console.error("Error saving permission:", err)
      setError("Error saving permission. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePermission = async (permission) => {
    if (!permission?.userId) return
    setRemovingPermission(true)
    setError(null)
    try {
      await deleteModulePermission(MODULES.REC_CONFERENCE, permission.userId)

      const response = await fetchModulePermissionUsers(MODULES.REC_CONFERENCE)
      setPermissions(Array.isArray(response.permissions) ? response.permissions : [])
      setPermissionToRemove(null)
    } catch (err) {
      console.error("Error deleting permission:", err)
      setError("Error removing permission. Please try again.")
      setPermissionToRemove(null)
    } finally {
      setRemovingPermission(false)
    }
  }

  const getPermissionBadgeVariant = (level) => {
    switch (level) {
      case "SUPER_ADMIN": return "danger"
      case "ADMIN": return "warning"
      case "EDITOR": return "success"
      case "VIEWER": return "info"
      default: return "secondary"
    }
  }

  const getUserName = (userId) => {
    const user = users.find(u => u.userId === userId)
    return user ? user.name : "Unknown User"
  }

  const availableUsers = users.filter(user =>
    !Array.isArray(permissions) || !permissions.some(perm => perm.userId === user.userId)
  )

  return (
    <Container fluid className="py-4">
      {/* Breadcrumb Navigation */}
      <Row className="mb-4">
        <Col>
          <Breadcrumb>
            <Breadcrumb.Item href="/dashboard">
              <FontAwesomeIcon icon={faHome} className="me-1" />
              Dashboard
            </Breadcrumb.Item>
            <Breadcrumb.Item href="/dashboard/rec-conference">
              REC Conference
            </Breadcrumb.Item>
            <Breadcrumb.Item active>
              User Permissions
            </Breadcrumb.Item>
          </Breadcrumb>
        </Col>
      </Row>

      {/* Page Header */}
      <Row className="mb-4">
        <Col md={8}>
          <div className="d-flex align-items-center">
            <FontAwesomeIcon icon={faUserShield} className="text-secondary me-3" size="2x" />
            <div>
              <h2 className="mb-1">REC Conference - User Permissions</h2>
              <p className="text-muted mb-0">
                Manage user access levels for the REC Conference module
              </p>
              {userPermissionLevel && !isSeniorManager() && (
                <small className="badge bg-success">
                  {userPermissionLevel} Access
                </small>
              )}
            </div>
          </div>
        </Col>
        <Col md={4} className="text-end">
          <Link href="/dashboard/rec-conference" className="btn btn-outline-secondary me-2">
            <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
            Back to REC Conference
          </Link>
          <Button variant="primary" onClick={handleAddPermission}>
            <FontAwesomeIcon icon={faPlus} className="me-2" />
            Add User
          </Button>
        </Col>
      </Row>

      {error && (
        <Row className="mb-4">
          <Col>
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          </Col>
        </Row>
      )}

      {/* Permissions Table */}
      <Row>
        <Col>
          <Card>
            <Card.Header>
              <h5 className="mb-0">Current User Permissions</h5>
            </Card.Header>
            <Card.Body>
              {permissions.length === 0 ? (
                <Alert variant="info" className="text-center">
                  <h6>No User Permissions Set</h6>
                  <p className="mb-0">Click "Add User" to grant REC Conference access to users.</p>
                </Alert>
              ) : (
                <Table responsive>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Permission Level</th>
                      <th>Added</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((permission) => (
                      <tr key={permission.$id}>
                        <td>
                          <strong>{getUserName(permission.userId)}</strong>
                        </td>
                        <td>
                          <Badge bg={getPermissionBadgeVariant(permission.permissions)}>
                            {permission.permissions}
                          </Badge>
                        </td>
                        <td>
                          <small className="text-muted">
                            {new Date(permission.$createdAt).toLocaleDateString()}
                          </small>
                        </td>
                        <td>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            className="me-2"
                            onClick={() => handleEditPermission(permission)}
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => setPermissionToRemove(permission)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Permission Levels Help */}
      <Row className="mt-4">
        <Col>
          <Card className="border-0 bg-light">
            <Card.Body className="py-3">
              <h6 className="mb-2">Permission Levels:</h6>
              <Row className="text-sm">
                <Col md={3}>
                  <Badge bg="info" className="me-2">VIEWER</Badge>
                  View conference details and register
                </Col>
                <Col md={3}>
                  <Badge bg="success" className="me-2">EDITOR</Badge>
                  Manage registrations and sessions
                </Col>
                <Col md={3}>
                  <Badge bg="warning" className="me-2">ADMIN</Badge>
                  Manage programs, coupons, and configurations
                </Col>
                <Col md={3}>
                  <Badge bg="danger" className="me-2">SUPER_ADMIN</Badge>
                  Full administrative access
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Add/Edit Permission Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <FontAwesomeIcon icon={faUserShield} className="me-2" />
            {editingPermission ? "Edit User Permission" : "Add User Permission"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>User</Form.Label>
              <Form.Select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={editingPermission !== null}
              >
                <option value="">Select a user...</option>
                {(editingPermission ? users : availableUsers).map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Permission Level</Form.Label>
              <Form.Select
                value={selectedPermissionLevel}
                onChange={(e) => setSelectedPermissionLevel(e.target.value)}
              >
                <option value="VIEWER">VIEWER - Can view and register</option>
                <option value="EDITOR">EDITOR - Can manage registrations and sessions</option>
                <option value="ADMIN">ADMIN - Can manage programs and coupons</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN - Full administrative access</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSavePermission} disabled={saving}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faUserShield} className="me-2" />
                {editingPermission ? "Update Permission" : "Add Permission"}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={Boolean(permissionToRemove)}
        onHide={() => {
          if (removingPermission) return
          setPermissionToRemove(null)
        }}
        centered
      >
        <Modal.Header closeButton={!removingPermission}>
          <Modal.Title>Remove user access</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-3">
            This person will lose REC Conference access immediately. They can be granted access again later if needed.
          </p>
          <p className="mb-0">
            <strong>{permissionToRemove ? getUserName(permissionToRemove.userId) : ""}</strong>
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setPermissionToRemove(null)}
            disabled={removingPermission}
          >
            Keep access
          </Button>
          <Button
            variant="danger"
            onClick={() => handleDeletePermission(permissionToRemove)}
            disabled={removingPermission}
          >
            {removingPermission ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Removing...
              </>
            ) : (
              "Remove access"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}
