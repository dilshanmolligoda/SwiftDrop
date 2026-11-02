import React from 'react'

interface AdminPlaceholderPageProps {
  readonly title: string
  readonly description: string
}

export const AdminPlaceholderPage: React.FC<AdminPlaceholderPageProps> = ({ title, description }) => {
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        {title}
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: 24 }}>
        {description}
      </p>

      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          padding: 32,
          textAlign: 'center',
          color: '#6b7280',
        }}
      >
        <p style={{ margin: 0, fontWeight: 500 }}>
          This view ({title}) is mounted and ready for module integration.
        </p>
      </div>
    </div>
  )
}

