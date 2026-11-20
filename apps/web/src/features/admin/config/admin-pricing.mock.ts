import type { ZonePricingItem } from '../types/admin-pricing.types'

export const MOCK_ZONES: readonly ZonePricingItem[] = [
  {
    id: 'z-1',
    name: 'Colombo Central',
    coveredAreas: 'Colombo 01–05',
    baseFeeLkr: 350,
    extraPerKgLkr: 80,
    isActive: true,
  },
  {
    id: 'z-2',
    name: 'Colombo South',
    coveredAreas: 'Colombo 06–07',
    baseFeeLkr: 400,
    extraPerKgLkr: 90,
    isActive: true,
  },
  {
    id: 'z-3',
    name: 'Nugegoda',
    coveredAreas: 'Nugegoda • Delkanda',
    baseFeeLkr: 450,
    extraPerKgLkr: 100,
    isActive: true,
  },
  {
    id: 'z-4',
    name: 'Dehiwala',
    coveredAreas: 'Dehiwala • Mount Lavinia',
    baseFeeLkr: 450,
    extraPerKgLkr: 100,
    isActive: true,
  },
  {
    id: 'z-5',
    name: 'Rajagiriya',
    coveredAreas: 'Rajagiriya • Nawala',
    baseFeeLkr: 450,
    extraPerKgLkr: 100,
    isActive: true,
  },
  {
    id: 'z-6',
    name: 'Wattala',
    coveredAreas: 'Wattala • Hendala',
    baseFeeLkr: 500,
    extraPerKgLkr: 120,
    isActive: false,
  },
] as const

