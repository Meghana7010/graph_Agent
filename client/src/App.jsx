import { useState, useEffect, useCallback } from 'react'
import GraphView from './Components/GraphView'
import ChatPanel from './Components/ChatPanel'
import TopBar from './components/TopBar'
import LegendPanel from './Components/LegendPanel'
import axios from 'axios'
import './App.css'

const API = 'http://localhost:3001'

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
  const [loading, setLoading] = useState(true)
  const [highlightIds, setHighlightIds] = useState(new Set())
  const [selectedNode, setSelectedNode] = useState(null)
  const [schema, setSchema] = useState({})
  const [stats, setStats] = useState({ nodes: 0, edges: 0 })

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/graph`),
      axios.get(`${API}/api/schema`),
    ]).then(([gRes, sRes]) => {
      setGraphData(gRes.data)
      setSchema(sRes.data)
      setStats({ nodes: gRes.data.nodes.length, edges: gRes.data.edges.length })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleChatHighlight = useCallback((ids) => {
    setHighlightIds(new Set(ids))
    setTimeout(() => setHighlightIds(new Set()), 8000)
  }, [])

  return (
    <div className="app">
      <TopBar stats={stats} loading={loading} />
      <div className="main-layout">
        <div className="graph-container">
          {loading ? (
            <div className="loading-screen">
              <div className="loading-spinner" />
              <div className="loading-text">Initializing graph database...</div>
              <div className="loading-sub">Loading 21,393 SAP records into SQLite</div>
            </div>
          ) : (
            <>
              <GraphView
                data={graphData}
                highlightIds={highlightIds}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
              />
              <LegendPanel />
            </>
          )}
        </div>
        <ChatPanel apiBase={API} onHighlight={handleChatHighlight} schema={schema} />
      </div>
    </div>
  )
}