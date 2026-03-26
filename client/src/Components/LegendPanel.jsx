const LEGEND = [
    { color: '#3b82f6', label: 'Sales Order' },
    { color: '#8b5cf6', label: 'Billing Document' },
    { color: '#f59e0b', label: 'Journal Entry' },
    { color: '#10b981', label: 'Payment' },
    { color: '#ec4899', label: 'Delivery' },
    { color: '#06b6d4', label: 'Business Partner' },
    { color: '#f97316', label: 'Product' },
  ]
  
  export default function LegendPanel() {
    return (
      <div className="legend-panel">
        <div className="legend-title">ENTITIES</div>
        {LEGEND.map(item => (
          <div key={item.label} className="legend-item">
            <span className="legend-dot" style={{ background: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    )
  }