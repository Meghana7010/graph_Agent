import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'

const NODE_R = 5

export default function GraphView({ data, highlightIds, onSelectNode }) {
  console.log(data, "data")

  const svgRef = useRef(null)
  const simRef = useRef(null)
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, node: null })

  const buildGraph = useCallback(() => {
    if (!svgRef.current || !data.nodes.length) return

    const container = svgRef.current.parentElement
    const W = container.clientWidth
    const H = container.clientHeight

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', W)
      .attr('height', H)

    // Defs
    const defs = svg.append('defs')
    defs.append('filter').attr('id', 'glow')
      .html(`<feGaussianBlur stdDeviation="3" result="coloredBlur"/>
             <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>`)

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (e) => g.attr('transform', e.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(0.6))

    // Simulation
    const nodes = data.nodes.map(n => ({ ...n }))
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    const links = data.edges
      .map(e => ({ ...e, source: nodeMap.get(e.source), target: nodeMap.get(e.target) }))
      .filter(e => e.source && e.target)

    simRef.current = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide(NODE_R + 4))

    // Links
    const link = g.append('g').attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#1e2330')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)

    // Nodes
    const node = g.append('g').attr('class', 'nodes')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', NODE_R)
      .attr('fill', d => d.color)
      .attr('stroke', '#0a0c10')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => {
          if (!e.active) simRef.current.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => {
          if (!e.active) simRef.current.alphaTarget(0)
          d.fx = null; d.fy = null
        })
      )
      .on('mouseover', (e, d) => {
        const rect = svgRef.current.getBoundingClientRect()
        setTooltip({ visible: true, x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10, node: d })
      })
      .on('mouseout', () => setTooltip(t => ({ ...t, visible: false })))
      .on('click', (e, d) => {
        e.stopPropagation()
        onSelectNode(d)
      })

    svg.on('click', () => onSelectNode(null))

    simRef.current.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
    })

    // Store refs for highlight updates
    svgRef.current._nodeSelection = node
    svgRef.current._linkSelection = link
  }, [data, onSelectNode])

  useEffect(() => {
    buildGraph()
    return () => simRef.current?.stop()
  }, [buildGraph])

  // Handle highlights
  useEffect(() => {
    const node = svgRef.current?._nodeSelection
    const link = svgRef.current?._linkSelection
    if (!node) return

    if (highlightIds.size === 0) {
      node.attr('r', NODE_R).attr('stroke', '#0a0c10').attr('stroke-width', 1.5).attr('opacity', 1)
      link.attr('stroke', '#1e2330').attr('stroke-opacity', 0.6)
    } else {
      node
        .attr('r', d => highlightIds.has(d.id) ? NODE_R * 2.5 : NODE_R)
        .attr('stroke', d => highlightIds.has(d.id) ? '#fff' : '#0a0c10')
        .attr('stroke-width', d => highlightIds.has(d.id) ? 2 : 1)
        .attr('opacity', d => highlightIds.has(d.id) ? 1 : 0.15)
        .attr('filter', d => highlightIds.has(d.id) ? 'url(#glow)' : null)
      link.attr('stroke-opacity', 0.1)
    }
  }, [highlightIds])

  // Responsive resize
  useEffect(() => {
    const obs = new ResizeObserver(() => buildGraph())
    if (svgRef.current?.parentElement) obs.observe(svgRef.current.parentElement)
    return () => obs.disconnect()
  }, [buildGraph])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />

      {/* Tooltip */}
      {tooltip.visible && tooltip.node && (
        <div
          className="node-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="tt-header">
            <span className="tt-dot" style={{ background: tooltip.node.color }} />
            <span className="tt-entity">{tooltip.node.entityType}</span>
          </div>
          <div className="tt-body">
            {Object.entries(tooltip.node.data || {}).slice(0, 7).map(([k, v]) => (
              <div key={k} className="tt-row">
                <span className="tt-key">{k}</span>
                <span className="tt-val">{String(v ?? '—').slice(0, 30)}</span>
              </div>
            ))}
            {Object.keys(tooltip.node.data || {}).length > 7 && (
              <div className="tt-more">+{Object.keys(tooltip.node.data).length - 7} more fields</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}