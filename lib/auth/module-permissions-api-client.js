const emptyPermissions = {
  users: [],
  permissions: [],
}

export const fetchCurrentModulePermissions = async () => ({
  modulePermissions: {},
})

export const fetchModulePermissionUsers = async () => emptyPermissions

export const saveModulePermission = async () => ({ ok: true })

export const deleteModulePermission = async () => ({ ok: true })
