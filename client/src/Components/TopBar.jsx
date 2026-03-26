export default function TopBar({ stats, loading }) {
    return (
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-logo">O2C</div>
          <div className="topbar-breadcrumb">
            <span className="bc-dim">Mapping</span>
            <span className="bc-sep">/</span>
            <span className="bc-active">Order to Cash</span>
          </div>
        </div>
        <div className="topbar-right">
          {loading ? (
            <div className="status-badge loading">
              <span className="status-dot pulsing" />
              Initializing DB...
            </div>
          ) : (
            <>
              <div className="stat-chip">
                <span className="stat-val">{stats.nodes}</span>
                <span className="stat-label">Nodes</span>
              </div>
              <div className="stat-chip">
                <span className="stat-val">{stats.edges}</span>
                <span className="stat-label">Edges</span>
              </div>
              <div className="status-badge ready">
                <span className="status-dot" />
                Live
              </div>
            </>
          )}
        </div>
      </header>
    )
  }