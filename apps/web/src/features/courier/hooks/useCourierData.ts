import { courierApi } from '../services/courierApi'
import type {
  CourierDashboard,
  DeliveryDetails,
  DeliveryListItem,
  ListDeliveriesQuery,
  PaginatedResponse,
} from '../types/courier.types'
import { useApiResource, type ApiResource } from './useApiResource'

export function useCourierDashboard(): ApiResource<CourierDashboard> {
  return useApiResource('courier-dashboard', (signal) => courierApi.getDashboard(signal))
}

export function useTodayDeliveries(query: ListDeliveriesQuery): ApiResource<PaginatedResponse<DeliveryListItem>> {
  const key = JSON.stringify([query.page, query.limit, query.status ?? null, query.search ?? ''])
  return useApiResource(`courier-deliveries:${key}`, (signal) => courierApi.listTodayDeliveries(query, signal), {
    keepPreviousData: true,
  })
}

export function useDeliveryDetails(parcelId: string): ApiResource<DeliveryDetails> {
  return useApiResource(`courier-delivery:${parcelId}`, (signal) => courierApi.getDeliveryDetails(parcelId, signal))
}
