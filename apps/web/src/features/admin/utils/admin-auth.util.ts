export function getUserInitials(name: string): string {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatUserRole(role: string): 'Admin' | 'Dispatcher' {
  if (role === 'ADMIN') {
    return 'Admin'
  }
  return 'Dispatcher'
}

