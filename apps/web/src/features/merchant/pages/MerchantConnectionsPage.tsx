import React from 'react'
import { KeyRound, Webhook } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { MerchantApiKeysPage } from './MerchantApiKeysPage'
import { MerchantWebhooksPage } from './MerchantWebhooksPage'
import styles from './MerchantPages.module.css'

const TABS = [
  { id: 'api-keys', label: 'API keys', icon: KeyRound },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
] as const

type TabId = (typeof TABS)[number]['id']

/**
 * "Store connections": everything a merchant's own system needs to talk to
 * SwiftDrop. API keys let the store call our API; webhooks let us call the store.
 * The active tab lives in the URL (?tab=webhooks) so it survives a refresh.
 */
export const MerchantConnectionsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab: TabId = searchParams.get('tab') === 'webhooks' ? 'webhooks' : 'api-keys'

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h2>Store connections</h2>
        <p>Connect your online store's system to SwiftDrop.</p>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Store connection settings">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`connections-tab-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`connections-panel-${id}`}
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => setSearchParams(id === 'api-keys' ? {} : { tab: id }, { replace: true })}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`connections-panel-${activeTab}`}
        aria-labelledby={`connections-tab-${activeTab}`}
      >
        {activeTab === 'api-keys' ? <MerchantApiKeysPage /> : <MerchantWebhooksPage />}
      </div>
    </div>
  )
}

export default MerchantConnectionsPage
