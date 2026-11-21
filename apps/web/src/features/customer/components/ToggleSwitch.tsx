import React from 'react'
import './ToggleSwitch.css'

interface ToggleSwitchProps {
  readonly isChecked: boolean
  readonly onToggleChange: (nextState: boolean) => void
  readonly switchIdentifier: string
  readonly accessibilityLabel: string
  readonly isDisabled?: boolean
}

/**
 * Reusable, accessible toggle switch component matching the SwiftDrop design system.
 * Follows Single Responsibility Principle (SRP) by handling only toggle interactions and state presentation.
 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  isChecked,
  onToggleChange,
  switchIdentifier,
  accessibilityLabel,
  isDisabled = false,
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (!isDisabled) {
        onToggleChange(!isChecked)
      }
    }
  }

  const handleClick = (): void => {
    if (!isDisabled) {
      onToggleChange(!isChecked)
    }
  }

  return (
    <button
      id={switchIdentifier}
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-label={accessibilityLabel}
      disabled={isDisabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`toggle-switch ${isChecked ? 'toggle-switch--active' : ''} ${
        isDisabled ? 'toggle-switch--disabled' : ''
      }`}
    >
      <span className="toggle-switch__thumb" />
    </button>
  )
}
