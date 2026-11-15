export type OrderStatus =
  | 'Awaiting pickup'
  | 'Out for delivery'
  | 'In transit'
  | 'Picked up'
  | 'Delivery failed'
  | 'Delivered'

export type OrderStatusClass =
  | 'statusAwaiting'
  | 'statusOutForDelivery'
  | 'statusInTransit'
  | 'statusPickedUp'
  | 'statusFailed'
  | 'statusDelivered'

export interface MerchantOrder {
  reference: string
  trackingNumber: string
  recipient: string
  destination: string
  status: OrderStatus
  statusClass: OrderStatusClass
  updated: string
}

export const MERCHANT_DASHBOARD_ORDERS: MerchantOrder[] = [
  {
    reference: 'GL-1048',
    trackingNumber: 'SD-24821',
    recipient: 'Nimal Perera',
    destination: 'Kandy',
    status: 'Awaiting pickup',
    statusClass: 'statusAwaiting',
    updated: '5 min ago',
  },
  {
    reference: 'GL-1047',
    trackingNumber: 'SD-24820',
    recipient: 'Amali Silva',
    destination: 'Galle',
    status: 'Out for delivery',
    statusClass: 'statusOutForDelivery',
    updated: '20 min ago',
  },
  {
    reference: 'GL-1046',
    trackingNumber: 'SD-24819',
    recipient: 'Kavindu Jay',
    destination: 'Colombo',
    status: 'In transit',
    statusClass: 'statusInTransit',
    updated: '1 hour ago',
  },
  {
    reference: 'GL-1045',
    trackingNumber: 'SD-24818',
    recipient: 'Tharushi De Silva',
    destination: 'Negombo',
    status: 'Picked up',
    statusClass: 'statusPickedUp',
    updated: '2 hours ago',
  },
  {
    reference: 'GL-1044',
    trackingNumber: 'SD-24817',
    recipient: 'Dinesh Fernando',
    destination: 'Matara',
    status: 'Delivery failed',
    statusClass: 'statusFailed',
    updated: '3 hours ago',
  },
  {
    reference: 'GL-1043',
    trackingNumber: 'SD-24816',
    recipient: 'Ishara Perera',
    destination: 'Kandy',
    status: 'Delivered',
    statusClass: 'statusDelivered',
    updated: 'Yesterday',
  },
  {
    reference: 'GL-1042',
    trackingNumber: 'SD-24815',
    recipient: 'Shehan Wijesinghe',
    destination: 'Kurunegala',
    status: 'In transit',
    statusClass: 'statusInTransit',
    updated: 'Yesterday',
  },
  {
    reference: 'GL-1041',
    trackingNumber: 'SD-24814',
    recipient: 'Ruwani Senanayake',
    destination: 'Jaffna',
    status: 'Delivered',
    statusClass: 'statusDelivered',
    updated: 'Yesterday',
  },
  {
    reference: 'GL-1040',
    trackingNumber: 'SD-24813',
    recipient: 'Chamath Kumara',
    destination: 'Anuradhapura',
    status: 'Awaiting pickup',
    statusClass: 'statusAwaiting',
    updated: '2 days ago',
  },
  {
    reference: 'GL-1039',
    trackingNumber: 'SD-24812',
    recipient: 'Dinithi Abeysekara',
    destination: 'Badulla',
    status: 'Delivered',
    statusClass: 'statusDelivered',
    updated: '2 days ago',
  },
]
