export interface AdminProfileData {
  fullName: string
  phoneNumber: string
  email: string
  role: 'Dispatcher' | 'Admin'
  initials: string
}

export interface RegionalPreferencesData {
  language: string
  timeZone: string
}

export interface NotificationPreferencesData {
  newUnassignedParcels: boolean
  failedDeliveryAttempts: boolean
  newMerchantOrCourierApplications: boolean
  soundAlerts: boolean
}

export interface SecuritySettingsData {
  twoStepVerificationEnabled: boolean
  lastPasswordChanged?: string
}

