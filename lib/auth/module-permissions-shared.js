export const PERMISSION_LEVELS = {
  VIEWER: "VIEWER",
  EDITOR: "EDITOR",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
}

export const PERMISSION_HIERARCHY = Object.values(PERMISSION_LEVELS)

export const getPermissionConfig = (level) => {
  const configs = {
    [PERMISSION_LEVELS.VIEWER]: {
      label: "Viewer",
      color: "info",
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canManage: false,
      canManagePermissions: false,
    },
    [PERMISSION_LEVELS.EDITOR]: {
      label: "Editor",
      color: "warning",
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canManage: false,
      canManagePermissions: false,
    },
    [PERMISSION_LEVELS.ADMIN]: {
      label: "Admin",
      color: "success",
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canManage: true,
      canManagePermissions: false,
    },
    [PERMISSION_LEVELS.SUPER_ADMIN]: {
      label: "Super Admin",
      color: "danger",
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canManage: true,
      canManagePermissions: true,
    },
  }

  return configs[level] || configs[PERMISSION_LEVELS.VIEWER]
}

export const hasPermission = (permissions, module, requiredLevel) => {
  const level = permissions?.[module]?.level
  return PERMISSION_HIERARCHY.indexOf(level) >= PERMISSION_HIERARCHY.indexOf(requiredLevel)
}

export const canPerformAction = (permissions, module, action) => {
  const permission = permissions?.[module]
  if (!permission) return false
  const actionMap = {
    view: "canView",
    create: "canCreate",
    edit: "canEdit",
    delete: "canDelete",
    manage: "canManage",
    managepermissions: "canManagePermissions",
  }
  return Boolean(permission[actionMap[String(action).toLowerCase()]])
}
