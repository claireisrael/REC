"use client"

import { createContext, useContext, useEffect, useMemo } from "react"
import { Client, Account, Databases, Storage } from "appwrite"
import { config } from "./config"

const client = new Client()
if (config.endpoint && config.projectId) {
  client.setEndpoint(config.endpoint).setProject(config.projectId)
}

// Initialize Appwrite services
const account = new Account(client)
const databases = new Databases(client)
const storage = new Storage(client)

const appwriteServicesSingleton = {
  client,
  account,
  databases,
  storage,
  config,
}

// Create Appwrite context
export const AppwriteContext = createContext(appwriteServicesSingleton)

// Appwrite provider component
export function AppwriteProvider({ children }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.appwriteServices = appwriteServicesSingleton
    }
  }, [])

  // Stable identity — a new object every render would re-trigger every consumer effect.
  const value = useMemo(() => appwriteServicesSingleton, [])

  return (
    <AppwriteContext.Provider value={value}>
      {children}
    </AppwriteContext.Provider>
  )
}

// Custom hook to use Appwrite context
export function useAppwrite() {
  return useContext(AppwriteContext)
}
