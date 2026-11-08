import React from 'react'
import { Info } from 'lucide-react'
import styles from '../pages/MerchantPages.module.css'

/** Marks a section whose backend is not built yet, so no mock data is shown in its place. */
export const NotConnectedNotice: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
  <div className={styles.notice} role="note">
    <Info size={16} aria-hidden="true" />
    <span>{children}</span>
  </div>
)
