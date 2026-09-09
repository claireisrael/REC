// Input validation and sanitization utilities

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const validatePassword = (password) => {
  // At least 8 characters, one uppercase, one lowercase, one number, one special char
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
  return passwordRegex.test(password)
}

export const validatePhoneNumber = (phone) => {
  // Basic international phone number validation
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/
  return phoneRegex.test(phone.replace(/\s/g, ''))
}

export const validateName = (name) => {
  // Only letters, spaces, hyphens, and apostrophes, 2-50 characters
  const nameRegex = /^[a-zA-Z\s\-']{2,50}$/
  return nameRegex.test(name.trim())
}

export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input
  
  // Remove potential XSS characters
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
}

export const validateFileSize = (file, maxSizeMB = 5) => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  return file.size <= maxSizeBytes
}

export const validateFileType = (file, allowedTypes = []) => {
  if (allowedTypes.length === 0) return true
  return allowedTypes.includes(file.type)
}

export const validateId = (id) => {
  // Validate Appwrite-style IDs (20+ character alphanumeric)
  const idRegex = /^[a-zA-Z0-9]{20,}$/
  return typeof id === 'string' && idRegex.test(id)
}

export const validateTextLength = (text, minLength = 0, maxLength = 1000) => {
  if (typeof text !== 'string') return false
  const length = text.trim().length
  return length >= minLength && length <= maxLength
}

export const sanitizeHtml = (html) => {
  // Basic HTML sanitization - remove script tags and dangerous attributes
  if (typeof html !== 'string') return html
  
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

export const validateFormData = (data, schema) => {
  const errors = {}
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field]
    
    if (rules.required && (!value || value.toString().trim() === '')) {
      errors[field] = `${field} is required`
      continue
    }
    
    if (value && rules.type === 'email' && !validateEmail(value)) {
      errors[field] = 'Invalid email format'
    }
    
    if (value && rules.type === 'password' && !validatePassword(value)) {
      errors[field] = 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    }
    
    if (value && rules.type === 'phone' && !validatePhoneNumber(value)) {
      errors[field] = 'Invalid phone number format'
    }
    
    if (value && rules.type === 'name' && !validateName(value)) {
      errors[field] = 'Name must contain only letters, spaces, hyphens, and apostrophes (2-50 characters)'
    }
    
    if (value && rules.minLength && value.toString().trim().length < rules.minLength) {
      errors[field] = `${field} must be at least ${rules.minLength} characters`
    }
    
    if (value && rules.maxLength && value.toString().trim().length > rules.maxLength) {
      errors[field] = `${field} must not exceed ${rules.maxLength} characters`
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}