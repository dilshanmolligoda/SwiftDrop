import type {
  ActiveUserSummary,
  ApplicationItem,
} from '../types/admin-users.types'

export const DEFAULT_USER_SUMMARY: ActiveUserSummary = {
  totalCustomers: 128,
  totalMerchants: 20,
  totalCouriers: 16,
  totalActive: 164,
}

export const MOCK_APPLICATIONS: readonly ApplicationItem[] = [
  {
    id: 'app-1',
    applicantName: 'Lanka Style',
    businessName: 'Lanka Style Clothing Ltd',
    ownerName: 'Dilshan Fernando',
    email: 'dilshan.fernando@example.com',
    phone: '+94 77 888 1234',
    initials: 'LS',
    type: 'Merchant',
    submittedDate: '25 Oct 2026',
    submittedTimeAgo: '3 days ago',
    status: 'Pending review',
    documents: [
      { title: 'Business Registration Certificate (PV-9812)', fileType: 'PDF', verified: true },
      { title: 'Tax Identification Document (TIN-4011)', fileType: 'PDF', verified: true },
      { title: 'Corporate Bank Verification Letter', fileType: 'PDF', verified: false },
    ],
    notes: 'Online apparel store looking to dispatch ~30 parcels daily across Greater Colombo.',
  },
  {
    id: 'app-2',
    applicantName: 'Ravindu Kumara',
    ownerName: 'Ravindu Kumara',
    email: 'ravindu.k@example.com',
    phone: '+94 71 222 3456',
    initials: 'RK',
    type: 'Courier',
    submittedDate: '26 Oct 2026',
    submittedTimeAgo: '1 day ago',
    status: 'Pending review',
    documents: [
      { title: 'National Identity Card (NIC)', fileType: 'PDF', verified: true },
      { title: 'Motorcycle Driving License (Heavy Bike)', fileType: 'PDF', verified: true },
      { title: 'Vehicle Revenue License (Valid till 2027)', fileType: 'PDF', verified: true },
      { title: 'Third-party Comprehensive Insurance', fileType: 'PDF', verified: true },
    ],
    notes: 'Owns a 150cc Yamaha motorcycle. Experienced with Colombo 03, 04, and 07 delivery routes.',
  },
  {
    id: 'app-3',
    applicantName: 'Ceylon Fresh',
    businessName: 'Ceylon Fresh Produce (Pvt) Ltd',
    ownerName: 'Amal Jayasinghe',
    email: 'amal.j@example.com',
    phone: '+94 76 333 4567',
    initials: 'CF',
    type: 'Merchant',
    submittedDate: '26 Oct 2026',
    submittedTimeAgo: '1 day ago',
    status: 'Pending review',
    documents: [
      { title: 'Business Registration Certificate (PV-4109)', fileType: 'PDF', verified: true },
      { title: 'Commercial Food Handling Permit', fileType: 'PDF', verified: true },
    ],
    notes: 'Organic groceries retailer. Urgent onboarding requested for same-day vegetable deliveries.',
  },
  {
    id: 'app-4',
    applicantName: 'Nethmi Perera',
    ownerName: 'Nethmi Perera',
    email: 'nethmi.p@example.com',
    phone: '+94 70 444 5678',
    initials: 'NP',
    type: 'Courier',
    submittedDate: '27 Oct 2026',
    submittedTimeAgo: 'Today',
    status: 'Pending review',
    documents: [
      { title: 'National Identity Card (NIC)', fileType: 'PDF', verified: true },
      { title: 'Valid Scooter / Light Vehicle License', fileType: 'PDF', verified: true },
      { title: 'Vehicle Insurance Policy', fileType: 'PDF', verified: true },
    ],
    notes: 'Available for evening dispatches in Nugegoda and Maharagama areas.',
  },
] as const

