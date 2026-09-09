"use client"

import { createContext, useContext, useMemo } from "react"
import { useAppwrite } from "@/lib/appwrite/provider"
import { config } from "@/lib/appwrite/config"
import {
  PERMISSION_LEVELS,
  canPerformAction,
  getPermissionConfig,
  hasPermission,
} from "@/lib/auth/module-permissions-shared"

const MODULES = {
  REC_CONFERENCE: config.recModule,
}

const recAdminPermission = {
  level: PERMISSION_LEVELS.SUPER_ADMIN,
  config: getPermissionConfig(PERMISSION_LEVELS.SUPER_ADMIN),
  ...getPermissionConfig(PERMISSION_LEVELS.SUPER_ADMIN),
}

const testUser = {
  id: "rec-test-admin",
  $id: "rec-test-admin",
  email: "rec-tester@local.test",
  name: "REC Tester",
  systemRole: "Senior Manager",
  isActive: true,
}

const AuthContext = createContext({
  user: null,
  isLoading: true,
  modulePermissions: {},
  login: async () => {},
  logout: async () => {},
  updateUserProfile: () => {},
  refreshPermissions: async () => {},
  extendSession: () => {},
})

export function AuthProvider({ children }) {
  const appwriteServices = useAppwrite()
  const modulePermissions = useMemo(
    () => ({ [MODULES.REC_CONFERENCE]: recAdminPermission }),
    []
  )

  const value = useMemo(() => {
    const isSeniorManager = () => true
    return {
      user: testUser,
      isLoading: false,
      modulePermissions,
      login: async () => testUser,
      logout: async () => {},
      updateUserProfile: () => {},
      refreshPermissions: async () => modulePermissions,
      extendSession: () => {},
      hasSystemRole: (role) =>
        Array.isArray(role) ? role.includes(testUser.systemRole) : role === testUser.systemRole,
      isDepartmentManager: () => true,
      isSeniorManager,
      hasModulePermission: (module, requiredLevel) =>
        hasPermission(modulePermissions, module, requiredLevel),
      canPerformModuleAction: (module, action) =>
        canPerformAction(modulePermissions, module, action),
      getModulePermissionLevel: (module) =>
        modulePermissions[module]?.level || PERMISSION_LEVELS.SUPER_ADMIN,
      hasModuleAccess: (module) => Boolean(modulePermissions[module]),
      getAccessibleModules: () => Object.values(MODULES),
      PERMISSION_LEVELS,
      MODULES,
      isLocked: false,
      lockoutMinutes: 0,
      sessionExpiry: null,
      getRemainingLockoutTime: () => 0,
      getSessionTimeRemaining: () => 0,
      appwriteServices,
    }
  }, [appwriteServices, modulePermissions])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
