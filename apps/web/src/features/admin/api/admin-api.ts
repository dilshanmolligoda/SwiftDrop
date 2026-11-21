import { apiRequest } from '../../../api/client'

export interface AdminDashboardKpis {
  totalToday: number
  pendingDispatch: number
  activeInTransit: number
  deliveredToday: number
  failedAttempts: number
  activeCouriersCount: number
  pendingApprovalsCount: number
}

export interface AdminDashboardResponse {
  kpis: AdminDashboardKpis
}

export interface AdminUnassignedParcel {
  id: string
  trackingNumber: string
  senderName: string
  senderAddress: string
  recipientName: string
  recipientAddress: string
  recipientPhone: string
  packageSize: string
  weightKg: string | number
  costLkr: string | number
  status: string
  createdAt: string
  orderReference?: string | null
}

export interface AssignCourierPayload {
  courierId: string
}

export interface AssignCourierResponse {
  assignmentId: string
  parcelId: string
  courierId: string
  courierName: string
  status: string
  assignedAt: string
}

export interface AdminCourierItem {
  id: string
  fullName: string
  email: string
  phoneNumber: string | null
  approvalStatus: string
  isActive: boolean
  createdAt: string
  activeDeliveriesCount: number
  courierProfile: {
    vehicleType: string
    licensePlate: string | null
    licenseNumber: string | null
  } | null
}

export interface AdminCouriersResponse {
  data: AdminCourierItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface AdminApplicationItem {
  id: string
  email: string
  fullName: string
  phoneNumber: string | null
  role: 'MERCHANT' | 'COURIER'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  isActive: boolean
  reviewedAt: string | null
  reviewedBy: string | null
  rejectionReason: string | null
  createdAt: string
  merchantProfile: {
    id: string
    businessName: string
    businessAddress: string
    businessType: string
  } | null
  courierProfile: {
    id: string
    vehicleType: string
    licensePlate: string | null
    licenseNumber: string | null
  } | null
}

export interface AdminApplicationsResponse {
  data: AdminApplicationItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface AdminDeliveryItem {
  id: string
  trackingNumber: string
  senderName: string
  senderAddress: string
  recipientName: string
  recipientAddress: string
  recipientPhone: string
  packageSize: string
  weightKg: string | number
  costLkr: string | number
  status: string
  failureReason: string | null
  failedDeliveryAttempts: number
  deliveredAt: string | null
  createdAt: string
  orderReference?: string | null
  activeAssignment: {
    id: string
    assignedAt: string
    courier: {
      id: string
      fullName: string
      phoneNumber: string | null
    }
  } | null
}

export interface AdminDeliveriesResponse {
  data: AdminDeliveryItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface AdminReportsLogItem {
  id: string
  trackingNumber: string
  recipientName: string
  recipientAddress: string
  courierName: string
  status: string
  failureReason: string | null
  completedAt: string
}

export interface AdminReportsResponse {
  metrics: {
    completedAttempts: number
    delivered: number
    failed: number
    successRate: number
    failureRate: number
  }
  logs: AdminReportsLogItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export const adminApi = {
  getDashboard: (signal?: AbortSignal) =>
    apiRequest<AdminDashboardResponse>('/admin/dashboard', { signal }),

  getUnassignedParcels: (signal?: AbortSignal) =>
    apiRequest<AdminUnassignedParcel[]>('/admin/deliveries/unassigned', { signal }),

  assignCourier: (parcelId: string, courierId: string) =>
    apiRequest<AssignCourierResponse>(`/admin/deliveries/${parcelId}/assign`, {
      method: 'POST',
      body: { courierId },
    }),

  getCouriers: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    apiRequest<AdminCouriersResponse>('/admin/couriers', { query: params }),

  getDeliveries: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    apiRequest<AdminDeliveriesResponse>('/admin/deliveries', { query: params }),

  getApplications: (params?: { page?: number; limit?: number; search?: string; status?: string; role?: string }) =>
    apiRequest<AdminApplicationsResponse>('/admin/applications', { query: params }),

  getApplicationDetails: (id: string) =>
    apiRequest<AdminApplicationItem & { reviewerName: string | null }>(`/admin/applications/${id}`),

  approveApplication: (id: string) =>
    apiRequest<AdminApplicationItem>(`/admin/applications/${id}/approve`, {
      method: 'PATCH',
    }),

  rejectApplication: (id: string, reason: string) =>
    apiRequest<AdminApplicationItem>(`/admin/applications/${id}/reject`, {
      method: 'PATCH',
      body: { reason },
    }),

  getReports: (params?: { page?: number; limit?: number; date?: string; status?: string }) =>
    apiRequest<AdminReportsResponse>('/admin/reports', { query: params }),
}
