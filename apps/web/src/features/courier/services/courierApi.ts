import { apiRequest, apiUpload, type ApiUploadOptions } from '../../../api/client'
import type {
  CourierDashboard,
  DeliveryDetails,
  DeliveryListItem,
  ListDeliveriesQuery,
  PaginatedResponse,
  ProofMetadata,
  ReportDeliveryFailureRequest,
  StatusUpdateResult,
  UpdateDeliveryStatusRequest,
} from '../types/courier.types'

const BASE_PATH = '/courier'

const deliveryPath = (parcelId: string) => `${BASE_PATH}/deliveries/${encodeURIComponent(parcelId)}`

export const courierApi = {
  getDashboard(signal?: AbortSignal): Promise<CourierDashboard> {
    return apiRequest<CourierDashboard>(`${BASE_PATH}/dashboard`, { signal })
  },

  listTodayDeliveries(
    query: ListDeliveriesQuery,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<DeliveryListItem>> {
    return apiRequest<PaginatedResponse<DeliveryListItem>>(`${BASE_PATH}/deliveries/today`, {
      query: {
        page: query.page,
        limit: query.limit,
        status: query.status,
        search: query.search?.trim(),
      },
      signal,
    })
  },

  getDeliveryDetails(parcelId: string, signal?: AbortSignal): Promise<DeliveryDetails> {
    return apiRequest<DeliveryDetails>(deliveryPath(parcelId), { signal })
  },

  updateStatus(parcelId: string, body: UpdateDeliveryStatusRequest): Promise<StatusUpdateResult> {
    return apiRequest<StatusUpdateResult>(`${deliveryPath(parcelId)}/status`, { method: 'PATCH', body })
  },

  uploadProof(parcelId: string, file: File, options?: ApiUploadOptions): Promise<ProofMetadata> {
    const formData = new FormData()
    formData.append('file', file, file.name)
    return apiUpload<ProofMetadata>(`${deliveryPath(parcelId)}/proof`, formData, options)
  },

  reportFailure(parcelId: string, body: ReportDeliveryFailureRequest): Promise<StatusUpdateResult> {
    return apiRequest<StatusUpdateResult>(`${deliveryPath(parcelId)}/failure`, { method: 'POST', body })
  },
}
