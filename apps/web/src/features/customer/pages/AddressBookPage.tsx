import React, { useState, useEffect } from 'react'
import {
  Package,
  Truck,
  AlertTriangle,
  Plus,
  Home,
  Building2,
  MapPin,
  MoreHorizontal,
  X,
  CheckCircle,
  AlertCircle,
  Trash2,
  Edit2,
  Bookmark,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCustomerDeliveries } from '../context/useCustomerDeliveries'
import './AddressBookPage.css'

export type AddressCategory = 'Home' | 'Work' | 'Family' | 'Other'

export interface CustomerAddress {
  id: string
  category: AddressCategory
  contactName: string
  streetAddress: string
  phoneNumber: string
  isDefault: boolean
}

const STORAGE_KEY = 'swiftdrop_customer_addresses'

const DEFAULT_ADDRESSES: readonly CustomerAddress[] = [
  {
    id: 'addr-1',
    category: 'Home',
    contactName: 'Jane Doe',
    streetAddress: '24 Lake Road, Colombo 05',
    phoneNumber: '077 ••• ••24',
    isDefault: true,
  },
  {
    id: 'addr-2',
    category: 'Work',
    contactName: 'Jane Doe',
    streetAddress: '18 Park Avenue, Colombo 02',
    phoneNumber: '077 ••• ••24',
    isDefault: false,
  },
  {
    id: 'addr-3',
    category: 'Family',
    contactName: 'Sam Perera',
    streetAddress: '12 Hill Road, Kandy',
    phoneNumber: '071 ••• ••56',
    isDefault: false,
  },
]

interface AddressFormFields {
  category: AddressCategory
  contactName: string
  streetAddress: string
  phoneNumber: string
  isDefault: boolean
}

const INITIAL_FORM_FIELDS: AddressFormFields = {
  category: 'Home',
  contactName: '',
  streetAddress: '',
  phoneNumber: '',
  isDefault: false,
}

/**
 * Customer Address Book screen for managing frequently used delivery & pickup locations.
 * Adheres to SOLID, DRY, and explicit naming guidelines.
 */
export const AddressBookPage: React.FC = () => {
  const { metrics } = useCustomerDeliveries()

  // Load addresses from localStorage with fallback to DEFAULT_ADDRESSES
  const [addresses, setAddresses] = useState<CustomerAddress[]>(() => {
    try {
      const persistedJson = localStorage.getItem(STORAGE_KEY)
      if (persistedJson !== null) {
        const parsed = JSON.parse(persistedJson) as CustomerAddress[]
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    } catch {
      // Graceful fallback to initial mockup addresses
    }
    return [...DEFAULT_ADDRESSES]
  })

  // Synchronize addresses to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses))
    } catch {
      // Gracefully handle storage quota or private browsing limits
    }
  }, [addresses])

  // Modal State for Add & Edit
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [formData, setFormData] = useState<AddressFormFields>(INITIAL_FORM_FIELDS)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AddressFormFields, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Active dropdown menu state for "•••" actions
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  // Feedback Notification Banner
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Close more menu when clicking outside
  useEffect(() => {
    const handleDocumentClick = (): void => {
      setActiveMenuId(null)
    }
    if (activeMenuId) {
      document.addEventListener('click', handleDocumentClick)
    }
    return () => {
      document.removeEventListener('click', handleDocumentClick)
    }
  }, [activeMenuId])

  // Mark an address as the default pickup location
  const handleSetDefaultAddress = (addressId: string): void => {
    setAddresses((previousAddresses) =>
      previousAddresses.map((item) => ({
        ...item,
        isDefault: item.id === addressId,
      })),
    )
    setFeedbackMessage({
      type: 'success',
      text: 'Default pickup address updated successfully.',
    })
  }

  // Delete an address
  const handleDeleteAddress = (addressId: string, addressLabel: string): void => {
    const confirmed = window.confirm(`Are you sure you want to delete the address "${addressLabel}"?`)
    if (!confirmed) return

    setAddresses((previousAddresses) => {
      const updated = previousAddresses.filter((item) => item.id !== addressId)
      // If we deleted the default address, promote the first remaining one to default
      if (updated.length > 0 && !updated.some((item) => item.isDefault)) {
        updated[0].isDefault = true
      }
      return updated
    })

    setFeedbackMessage({
      type: 'success',
      text: `Address "${addressLabel}" was deleted successfully.`,
    })
  }

  // Open modal in "Add" mode
  const handleOpenAddModal = (): void => {
    setEditingAddressId(null)
    setFormData({
      ...INITIAL_FORM_FIELDS,
      isDefault: addresses.length === 0,
    })
    setFormErrors({})
    setIsModalOpen(true)
  }

  // Open modal in "Edit" mode
  const handleOpenEditModal = (address: CustomerAddress): void => {
    setEditingAddressId(address.id)
    setFormData({
      category: address.category,
      contactName: address.contactName,
      streetAddress: address.streetAddress,
      phoneNumber: address.phoneNumber,
      isDefault: address.isDefault,
    })
    setFormErrors({})
    setIsModalOpen(true)
  }

  // Validate form inputs
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof AddressFormFields, string>> = {}

    if (!formData.contactName.trim()) {
      errors.contactName = 'Contact person name is required.'
    }

    if (!formData.streetAddress.trim()) {
      errors.streetAddress = 'Street address and city are required.'
    }

    if (!formData.phoneNumber.trim()) {
      errors.phoneNumber = 'Phone number is required.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Handle form submission (Add or Edit)
  const handleSaveAddress = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    await new Promise((resolve) => setTimeout(resolve, 300))

    if (editingAddressId) {
      // Edit existing
      setAddresses((previousAddresses) =>
        previousAddresses.map((item) => {
          if (item.id === editingAddressId) {
            return {
              ...item,
              category: formData.category,
              contactName: formData.contactName.trim(),
              streetAddress: formData.streetAddress.trim(),
              phoneNumber: formData.phoneNumber.trim(),
              isDefault: formData.isDefault,
            }
          }
          // If this item was marked default, unset others
          if (formData.isDefault) {
            return { ...item, isDefault: false }
          }
          return item
        }),
      )
      setFeedbackMessage({
        type: 'success',
        text: 'Address updated successfully.',
      })
    } else {
      // Add new
      const newAddress: CustomerAddress = {
        id: `addr-${Date.now()}`,
        category: formData.category,
        contactName: formData.contactName.trim(),
        streetAddress: formData.streetAddress.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        isDefault: formData.isDefault || addresses.length === 0,
      }

      setAddresses((previousAddresses) => {
        if (newAddress.isDefault) {
          return [newAddress, ...previousAddresses.map((item) => ({ ...item, isDefault: false }))]
        }
        return [...previousAddresses, newAddress]
      })

      setFeedbackMessage({
        type: 'success',
        text: 'New address added to your address book.',
      })
    }

    setIsSubmitting(false)
    setIsModalOpen(false)
  }

  // Category Icon Resolver
  const renderCategoryIcon = (category: AddressCategory) => {
    switch (category) {
      case 'Home':
        return <Home className="address-card__icon address-card__icon--home" />
      case 'Work':
        return <Building2 className="address-card__icon address-card__icon--work" />
      case 'Family':
      default:
        return <MapPin className="address-card__icon address-card__icon--family" />
    }
  }

  return (
    <div className="address-book-container">
      {/* Top Header Row */}
      <div className="address-book-header">
        <div className="address-book-header__left">
          <h1 className="address-book-header__title">Address book</h1>
          <p className="address-book-header__subtitle">
            Save addresses for faster delivery bookings.
          </p>
        </div>
        <Link to="/customer/create-delivery" className="address-book-header__cta-btn">
          <Plus className="w-4 h-4 mr-2" />
          <span>Create delivery</span>
        </Link>
      </div>

      {/* Global Status Banner */}
      {feedbackMessage && (
        <div
          role="status"
          className={`address-book-feedback address-book-feedback--${feedbackMessage.type}`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle className="address-book-feedback__icon" />
          ) : (
            <AlertCircle className="address-book-feedback__icon" />
          )}
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            className="address-book-feedback__close-btn"
            onClick={() => setFeedbackMessage(null)}
            aria-label="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overview Metric Stat Cards */}
      <section className="address-book-metrics" aria-label="Delivery Statistics">
        <article className="metric-card">
          <div className="metric-card__icon-wrapper metric-card__icon-wrapper--green">
            <Package className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="metric-card__content">
            <span className="metric-card__label">Active deliveries</span>
            <span className="metric-card__value">{metrics.activeDeliveries}</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon-wrapper metric-card__icon-wrapper--green">
            <Truck className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="metric-card__content">
            <span className="metric-card__label">Delivered this month</span>
            <span className="metric-card__value">{metrics.deliveredThisMonth}</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon-wrapper metric-card__icon-wrapper--orange">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="metric-card__content">
            <span className="metric-card__label">Needs attention</span>
            <span className="metric-card__value">{metrics.needsAttention}</span>
          </div>
        </article>
      </section>

      {/* Saved Addresses Card */}
      <section className="saved-addresses-card">
        <div className="saved-addresses-card__header">
          <h2 className="saved-addresses-card__title">Saved addresses</h2>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="saved-addresses-card__add-btn"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Add address</span>
          </button>
        </div>

        {addresses.length === 0 ? (
          <div className="saved-addresses-empty">
            <Bookmark className="w-10 h-10 text-slate-300 mb-3" />
            <p className="saved-addresses-empty__title">No saved addresses found</p>
            <p className="saved-addresses-empty__subtitle">
              Add your home, office, or client addresses to speed up parcel booking.
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="saved-addresses-empty__btn"
            >
              Add your first address
            </button>
          </div>
        ) : (
          <div className="saved-addresses-list">
            {addresses.map((address) => (
              <article key={address.id} className="address-card">
                <div className="address-card__left">
                  <div className="address-card__icon-badge">
                    {renderCategoryIcon(address.category)}
                  </div>

                  <div className="address-card__details">
                    <div className="address-card__title-row">
                      <span className="address-card__label">{address.category}</span>
                      {address.isDefault && (
                        <span className="address-card__badge-default">Default pickup</span>
                      )}
                    </div>
                    <p className="address-card__contact">{address.contactName}</p>
                    <p className="address-card__street">{address.streetAddress}</p>
                    <p className="address-card__phone">{address.phoneNumber}</p>
                  </div>
                </div>

                <div className="address-card__actions">
                  {!address.isDefault && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSetDefaultAddress(address.id)}
                        className="address-card__btn-action"
                      >
                        Set as default
                      </button>
                      <span className="address-card__separator" aria-hidden="true">
                        |
                      </span>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(address)}
                    className="address-card__btn-action"
                  >
                    Edit
                  </button>

                  <span className="address-card__separator" aria-hidden="true">
                    |
                  </span>

                  <div className="address-card__more-wrapper">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveMenuId(activeMenuId === address.id ? null : address.id)
                      }}
                      className="address-card__btn-more"
                      aria-label={`More options for ${address.category} address`}
                    >
                      <MoreHorizontal className="w-4 h-4 text-slate-500" />
                    </button>

                    {activeMenuId === address.id && (
                      <div className="address-card__dropdown-menu">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null)
                            handleOpenEditModal(address)
                          }}
                          className="address-card__dropdown-item"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-2" />
                          Edit details
                        </button>
                        {!address.isDefault && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null)
                              handleSetDefaultAddress(address.id)
                            }}
                            className="address-card__dropdown-item"
                          >
                            <Bookmark className="w-3.5 h-3.5 mr-2" />
                            Make default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null)
                            handleDeleteAddress(address.id, address.category)
                          }}
                          className="address-card__dropdown-item address-card__dropdown-item--danger"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete address
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Add / Edit Address Dialog Modal */}
      {isModalOpen && (
        <div className="address-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div
            className="address-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="address-modal-title"
          >
            <div className="address-modal-header">
              <h3 id="address-modal-title" className="address-modal-title">
                {editingAddressId ? 'Edit Address' : 'Add New Address'}
              </h3>
              <button
                type="button"
                className="address-modal-close"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="address-modal-form" noValidate>
              <div className="address-form-group">
                <label className="address-label" htmlFor="modal-category-select">
                  Address Label
                </label>
                <div className="address-category-selector">
                  {(['Home', 'Work', 'Family', 'Other'] as AddressCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat })}
                      className={`address-category-chip ${
                        formData.category === cat ? 'address-category-chip--active' : ''
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="address-form-group">
                <label className="address-label" htmlFor="modal-contact-name">
                  Contact Person Name
                </label>
                <input
                  id="modal-contact-name"
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  className={`address-input ${formErrors.contactName ? 'address-input--error' : ''}`}
                  placeholder="e.g. Jane Doe"
                  autoFocus
                />
                {formErrors.contactName && (
                  <span className="address-error-text">{formErrors.contactName}</span>
                )}
              </div>

              <div className="address-form-group">
                <label className="address-label" htmlFor="modal-street-address">
                  Street Address & City
                </label>
                <input
                  id="modal-street-address"
                  type="text"
                  value={formData.streetAddress}
                  onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
                  className={`address-input ${formErrors.streetAddress ? 'address-input--error' : ''}`}
                  placeholder="e.g. 24 Lake Road, Colombo 05"
                />
                {formErrors.streetAddress && (
                  <span className="address-error-text">{formErrors.streetAddress}</span>
                )}
              </div>

              <div className="address-form-group">
                <label className="address-label" htmlFor="modal-phone-number">
                  Phone Number
                </label>
                <input
                  id="modal-phone-number"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  className={`address-input ${formErrors.phoneNumber ? 'address-input--error' : ''}`}
                  placeholder="e.g. 077 123 4567"
                />
                {formErrors.phoneNumber && (
                  <span className="address-error-text">{formErrors.phoneNumber}</span>
                )}
              </div>

              <div className="address-checkbox-row">
                <label className="address-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="address-checkbox"
                  />
                  <span>Set as default pickup address</span>
                </label>
              </div>

              <div className="address-modal-actions">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="address-btn-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="address-btn-save"
                >
                  {isSubmitting ? 'Saving...' : editingAddressId ? 'Update address' : 'Save address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default AddressBookPage
