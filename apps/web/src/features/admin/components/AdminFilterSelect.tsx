import React, { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import styles from './AdminFilterSelect.module.css'

export interface SelectOption {
  value: string
  label: string
}

export interface AdminFilterSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  ariaLabel: string
  className?: string
}

export const AdminFilterSelect: React.FC<AdminFilterSelectProps> = ({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const selectedOption = options.find((opt) => opt.value === value) || options[0]

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = (val: string) => {
    onChange(val)
    setIsOpen(false)
  }

  return (
    <div className={`${styles.selectContainer} ${className || ''}`} ref={containerRef}>
      <button
        type="button"
        className={styles.triggerButton}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
      >
        <span className={styles.triggerText}>{selectedOption ? selectedOption.label : ''}</span>
        <ChevronDown
          size={16}
          className={`${styles.chevronIcon} ${isOpen ? styles.chevronOpen : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <ul
          id={listboxId}
          className={styles.dropdownMenu}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <li key={option.value}>
                <button
                  type="button"
                  className={`${styles.optionItem} ${isSelected ? styles.optionSelected : ''}`}
                  onClick={() => handleSelect(option.value)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check size={14} className={styles.checkIcon} aria-hidden="true" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
