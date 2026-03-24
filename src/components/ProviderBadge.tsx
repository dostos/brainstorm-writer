import React from 'react'

const COLORS: Record<string, string> = {
  claude: '#c49',
  openai: '#49c',
  gemini: '#4c9',
}

interface Props {
  provider: string
  selected: boolean
  onClick: () => void
}

export const ProviderBadge: React.FC<Props> = ({ provider, selected, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: selected ? (COLORS[provider] || '#888') : '#333',
      color: selected ? '#fff' : '#888',
      padding: '3px 10px',
      borderRadius: 3,
      fontSize: 11,
      fontWeight: 'bold',
      cursor: 'pointer',
      textTransform: 'capitalize',
      transition: 'background 0.15s',
    }}
  >
    {provider}
  </div>
)
