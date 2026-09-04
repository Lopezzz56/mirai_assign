import { useState, Fragment } from 'react'
import type { Impact, Operation, Plan } from '../../types'
import type { ViewId } from '../../hooks/useScheduler'
import { Info, Play } from 'lucide-react'

interface GuideViewProps {
  plan: Plan
  baseline: Plan | null
  impact: Impact | null
  onResetDemo: () => Promise<void>
  onReplan: (strategy?: string, customPayload?: any) => Promise<void>
  onAnalyze: (customPayload?: any) => Promise<void>
  onSetView: (v: ViewId) => void
  onSetPinningOp: (op: Operation) => void
  onSetSupervisorTab: (tab: 'jobs' | 'alerts' | 'shift') => void
}

export function GuideView({
  plan,
  onResetDemo,
  onReplan,
  onAnalyze,
  onSetView,
  onSetPinningOp,
  onSetSupervisorTab,
}: GuideViewProps) {
  const [role, setRole] = useState<'supervisor' | 'owner'>('owner')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'actions' | 'problems'>('dashboard')
  const [activeHotspot, setActiveHotspot] = useState<number>(1)
  const [exampleStep, setExampleStep] = useState<1 | 2 | 3>(1)
  const [exampleLoading, setExampleLoading] = useState(false)
  const [selectedProblem, setSelectedProblem] = useState<string | null>(null)
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<string>('PLAN')
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)

  const tryPin = () => {
    const firstOp = plan.operations[0]
    if (firstOp) onSetPinningOp(firstOp)
  }
  const tryMachineDown = () => onSetSupervisorTab('jobs')
  const tryMaterialDelay = () => onSetSupervisorTab('jobs')
  const tryRework = () => onSetSupervisorTab('jobs')
  const tryReplanBtn = () => {
    onSetView('control')
    setTimeout(() => { document.querySelector('.disruption-layout')?.scrollIntoView({ behavior: 'smooth' }) }, 100)
  }
  const tryCompare = () => {
    onSetView('control')
    setTimeout(() => { document.querySelector('.compare-layout')?.scrollIntoView({ behavior: 'smooth' }) }, 100)
  }
  const tryReset = async () => {
    await onResetDemo()
    onSetView('control')
  }

  const hotspots = [
    { id: 1, title: 'On-Time %', desc: 'The percentage of orders expected to finish by their promised delivery date. The algorithms aim to keep this as close to 100% as possible by managing resources and shifts.' },
    { id: 2, title: 'Penalty Exposure / Risk', desc: 'The total financial penalty SPW faces if current jobs are delivered late. Simulated disruptions will spike this value, signaling that a replan is needed to protect customer relationships.' },
    { id: 3, title: 'Bottleneck Center', desc: 'The work center limiting the overall factory throughput (usually Grinding). The solver schedules jobs at this center with maximum efficiency to ensure it is constantly utilized.' },
    { id: 4, title: 'Gantt Schedule', desc: 'A live visual timeline mapping out exactly when each machine runs each job. It highlights baseline plans (semi-transparent bars) and active plans side-by-side to show deviations.' },
    { id: 5, title: 'At-Risk Orders', desc: 'A priority watch-list of customer orders whose completion times are tight against their due dates. Allows shop managers to monitor risk thresholds before penalties accumulate.' },
  ]

  const workflowSteps = [
    { id: 'PLAN', title: 'Plan', desc: 'Initialize baseline schedule (V001) using master routing, setup transition matrices, and operator skills.' },
    { id: 'MONITOR', title: 'Monitor', desc: 'Track live progress on the shop floor. Supervisor Tablet displays current and next operations in the queue.' },
    { id: 'PROBLEM?', title: 'Problem?', desc: 'Unexpected changes happen on the shop floor, such as machine breakdowns, absent operators, or late materials.' },
    { id: 'RECORD', title: 'Record', desc: 'Supervisor uses the tablet to record the event offline or online, which creates a structured disruption preset.' },
    { id: 'ANALYZE', title: 'Analyze', desc: 'Backend simulator runs a "do-nothing" projection to calculate affected orders, bottleneck shifts, and penalty exposure.' },
    { id: 'REPLAN', title: 'Replan', desc: 'Owner triggers OR-Tools CP-SAT. The solver finds optimal machine assignments and schedules overtime if necessary.' },
    { id: 'COMPARE', title: 'Compare', desc: 'Compare old vs new metrics. Audit moved operations, machines changed, and stability impact costs.' },
    { id: 'DECIDE', title: 'Decide', desc: 'Approve the optimal replanned schedule or implement manual overrides to pin critical operations first.' },
  ]

  return (
    <section className="guide-view-container" style={{ display: 'grid', gap: '24px', maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* 1. Header & Role Switcher */}
      <div className="guide-hero" style={{ textAlign: 'center', padding: '24px 0', borderBottom: '1px solid #d9e0dd' }}>
        <p className="eyebrow" style={{ color: '#778783' }}>Interactive Guide</p>
        <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '8px 0' }}>Run the shop. Understand the plan. React when reality changes.</h1>
        <p className="subhead" style={{ marginBottom: '20px' }}>A quick interactive guide to operating the SPW production control system.</p>
        <div style={{ display: 'inline-flex', background: '#e9eeec', padding: '4px', borderRadius: '8px', gap: '4px', margin: '0 auto' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, padding: '6px 12px', alignSelf: 'center', color: '#566560' }}>I am a:</span>
          <button className={`lang-btn ${role === 'supervisor' ? 'active' : ''}`} onClick={() => setRole('supervisor')} style={{ border: 'none', padding: '6px 16px', borderRadius: '6px' }}>Supervisor</button>
          <button className={`lang-btn ${role === 'owner' ? 'active' : ''}`} onClick={() => setRole('owner')} style={{ border: 'none', padding: '6px 16px', borderRadius: '6px' }}>Owner</button>
        </div>
      </div>

      {/* Role Helper Banner */}
      <div className="banner" style={{ background: '#f5f8f7', borderLeft: '4px solid #d7ef63', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
          <Info size={16} />
          <span>Currently Emphasizing: {role === 'owner' ? 'Owner view' : 'Supervisor view'}</span>
        </div>
        <p className="muted" style={{ fontSize: '12px' }}>
          {role === 'owner'
            ? 'Highlighting KPIs, schedule margins, cost metrics, strategy comparisons, and OR-Tools optimization parameters.'
            : 'Highlighting shop-floor tablet functions, next job queues, machine breakdowns, material delays, and offline queue syncing.'}
        </p>
      </div>

      {/* 2. Tab Navigation */}
      <div className="guide-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {(['dashboard', 'actions', 'problems'] as const).map((tab, idx) => (
          <button
            key={tab}
            className={`btn-large ${activeTab === tab ? 'complete' : 'rework'}`}
            onClick={() => setActiveTab(tab)}
            style={{ padding: '16px', height: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: activeTab === tab ? '#132025' : '#778783' }}>Step {idx + 1}</span>
            <b style={{ fontSize: '15px' }}>{['Understand the Dashboard', 'Learn the Actions', 'Solve a Situation'][idx]}</b>
          </button>
        ))}
      </div>

      {/* Tab A: Dashboard */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', alignItems: 'start' }} className="workbench">
          <div className="panel" style={{ position: 'relative', display: 'grid', gap: '14px', background: '#fcfdfc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8e5', paddingBottom: '8px' }}>
              <b style={{ fontSize: '12px', color: '#778783' }}>MINIATURE OWNER DASHBOARD</b>
              <span className="pill" style={{ minHeight: 'auto', padding: '2px 8px', fontSize: '10px' }}>V001</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[
                { id: 1, label: 'On-Time %', value: '93%', color: undefined },
                { id: 2, label: 'Penalty Risk', value: '₹27K', color: '#b44638' },
                { id: 3, label: 'Bottleneck', value: 'GRIND (96%)', color: undefined, fontSize: '13px' },
              ].map(item => (
                <div
                  key={item.id}
                  style={{ padding: '8px', border: activeHotspot === item.id ? '2px solid #adc64a' : '1px solid #d9e0dd', background: activeHotspot === item.id ? '#f1f8d9' : '#fff', borderRadius: '6px', cursor: 'pointer', position: 'relative' }}
                  onClick={() => setActiveHotspot(item.id)}
                >
                  <span style={{ fontSize: '10px', color: '#778783' }}>{item.label}</span>
                  <b style={{ display: 'block', fontSize: item.fontSize ?? '16px', color: item.color }}>{item.value}</b>
                  <span className="brand-mark" style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', fontSize: '10px' }}>{item.id}</span>
                </div>
              ))}
            </div>
            <div
              style={{ padding: '10px', border: activeHotspot === 4 ? '2px solid #adc64a' : '1px solid #d9e0dd', background: activeHotspot === 4 ? '#f1f8d9' : '#fff', borderRadius: '8px', cursor: 'pointer' }}
              onClick={() => setActiveHotspot(4)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <b style={{ fontSize: '11px', color: '#566560' }}>Gantt Schedule</b>
                <span className="brand-mark" style={{ width: '16px', height: '16px', fontSize: '10px' }}>4</span>
              </div>
              <div style={{ display: 'grid', gap: '6px', fontSize: '10px', fontFamily: 'monospace' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', alignItems: 'center' }}>
                  <span>CNC-L01</span>
                  <div style={{ height: '10px', background: '#e9eeec', borderRadius: '3px', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '10%', width: '40%', height: '100%', background: '#5d7894', borderRadius: '3px' }}></div>
                    <div style={{ position: 'absolute', left: '60%', width: '25%', height: '100%', background: '#5d7894', borderRadius: '3px' }}></div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', alignItems: 'center' }}>
                  <span>GRIND-01</span>
                  <div style={{ height: '10px', background: '#e9eeec', borderRadius: '3px', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '20%', width: '55%', height: '100%', background: '#d16b4f', borderRadius: '3px' }}></div>
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{ padding: '10px', border: activeHotspot === 5 ? '2px solid #adc64a' : '1px solid #d9e0dd', background: activeHotspot === 5 ? '#f1f8d9' : '#fff', borderRadius: '8px', cursor: 'pointer' }}
              onClick={() => setActiveHotspot(5)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <b style={{ fontSize: '11px', color: '#566560' }}>At-Risk Promises</b>
                <span className="brand-mark" style={{ width: '16px', height: '16px', fontSize: '10px' }}>5</span>
              </div>
              <div style={{ display: 'grid', gap: '4px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px', background: '#fdfbf9', border: '1px solid #f6e3e1' }}>
                  <b>SPW-021 (Apex Auto)</b>
                  <span style={{ color: '#b44638', fontWeight: 'bold' }}>LATE +12h</span>
                </div>
              </div>
            </div>
          </div>
          <div className="panel" style={{ display: 'grid', gap: '14px', background: '#f5f7f6', borderLeft: '4px solid #adc64a' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800 }}>{hotspots.find(h => h.id === activeHotspot)?.title}</h3>
            <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#334440' }}>{hotspots.find(h => h.id === activeHotspot)?.desc}</p>
            <div style={{ marginTop: '10px', padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '11px', color: '#778783' }}>
              💡 <i>Click any section on the mini-dashboard to inspect what it represents.</i>
            </div>
          </div>
        </div>
      )}

      {/* Tab B: Actions */}
      {activeTab === 'actions' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <p className="subhead">Important scheduler commands you can trigger directly from the workbench:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {[
              { title: 'Generate Baseline', does: 'Restores baseline simulation V001.', when: 'Resetting data and solving constraints from scratch.', what: 'Solves 101 operations under normal parameters.', btn: 'Try Reset Demo →', onClick: tryReset, ownerHighlight: true },
              { title: 'Replan Schedule', does: 'Recalculates scheduling slots.', when: 'Shop-floor disruptions or overrides are applied.', what: 'Solves the new objective (overtime vs penalties).', btn: 'Try Replan →', onClick: tryReplanBtn, ownerHighlight: true },
              { title: 'Machine Down', does: 'Removes target machine capacity from solver.', when: 'A machine suffers a breakdown/maintenance block.', what: 'Machine ID, start minute, and downtime window.', whatLabel: 'Inputs', btn: 'Try Machine Down →', onClick: tryMachineDown, supHighlight: true, dangerColor: '#b44638', dangerBg: '#fbf1f0', dangerBorder: '#f3dad6' },
              { title: 'Material Missing', does: 'Sets release constraint forward for order.', when: 'Incoming raw material delivery is delayed.', what: 'Order ID and expected arrival delay time.', whatLabel: 'Inputs', btn: 'Try Material Delay →', onClick: tryMaterialDelay, supHighlight: true, dangerColor: '#b77843', dangerBg: '#fff8ef', dangerBorder: '#f7e6d0' },
              { title: 'Rework / Scrap', does: 'Adds extra processing cycles to the operation.', when: 'Parts fail inspection and need re-processing.', what: 'Order ID, failed quantity, and active operation.', whatLabel: 'Inputs', btn: 'Try Rework →', onClick: tryRework, supHighlight: true, dangerColor: '#438b4d', dangerBg: '#f5f8f5', dangerBorder: '#dce7dc' },
              { title: 'Pin Operations', does: 'Locks task first, to machine, or to operator.', when: 'Critical customer requirements override math.', what: 'Order ID, Pin Type, target resource, reason.', whatLabel: 'Inputs', btn: 'Try Pinning →', onClick: tryPin, ownerHighlight: true },
              { title: 'Compare Plans', does: 'Calculates plan-to-plan KPIs and moved operations.', when: 'Deciding if the Replan is worth the stability cost.', what: 'Cost delta, penalty difference, jobs moved.', whatLabel: 'Outputs', btn: 'Try Compare →', onClick: tryCompare, ownerHighlight: true },
            ].map(card => (
              <div key={card.title} className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: (card.ownerHighlight && role === 'owner') || (card.supHighlight && role === 'supervisor') ? `4px solid ${card.dangerColor ?? '#d7ef63'}` : '1px solid #d9e0dd' }}>
                <div>
                  <h3 style={{ fontWeight: 800 }}>{card.title}</h3>
                  <p style={{ fontSize: '12px', margin: '4px 0 10px', color: '#65746f' }}><b>Does:</b> {card.does}</p>
                  <p style={{ fontSize: '12px', margin: '4px 0 10px', color: '#65746f' }}><b>Use when:</b> {card.when}</p>
                  <div style={{ fontSize: '11px', background: card.dangerBg ?? '#f5f7f6', color: card.dangerColor, padding: '6px', borderRadius: '4px', margin: '8px 0' }}>
                    <b>{card.whatLabel ?? 'What happens'}:</b> {card.what}
                  </div>
                </div>
                <button className={card.dangerColor ? 'secondary' : 'primary'} onClick={card.onClick} style={{ width: '100%', fontSize: '12px', minHeight: '34px', padding: '6px', borderColor: card.dangerBorder, color: card.dangerColor }}>{card.btn}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab C: Solve a Situation */}
      {activeTab === 'problems' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div className="panel" style={{ background: '#fbfff0', borderColor: '#cad8a0' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#132025', marginBottom: '4px' }}>Something went wrong?</h2>
            <p className="subhead" style={{ color: '#53635f' }}>Select a situation below to see the exact workflow and actions to resolve it.</p>
            <div className="preset-grid" style={{ marginTop: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {[
                ['breakdown', '🔴 Machine stopped'],
                ['absence', '🟠 Operator unavailable'],
                ['material', '🟡 Material is late'],
                ['quality', '🟣 Parts failed inspection'],
                ['power', '⚡ Power problem'],
                ['urgent', '👑 Customer escalation'],
              ].map(([id, label]) => (
                <button key={id} className={`preset ${selectedProblem === id ? 'active' : ''}`} onClick={() => setSelectedProblem(id)}>{label}</button>
              ))}
            </div>
          </div>

          {selectedProblem === 'breakdown' && (
            <div className="panel" style={{ background: '#fff', borderLeft: '4px solid #b44638', display: 'grid', gap: '12px' }}>
              <h3>🔴 MACHINE BREAKDOWN WORKFLOW</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }} className="workbench">
                <div>
                  <ol style={{ paddingLeft: '16px', fontSize: '13px', lineHeight: 1.6 }}>
                    <li>Open <b>Supervisor Tablet</b>.</li>
                    <li>Tap <b>Machine Down</b> button.</li>
                    <li>Select the broken machine (e.g., Cylindrical Grinder <code>GRIND-G02</code>).</li>
                    <li>Enter estimated repair downtime (e.g., 480 minutes).</li>
                    <li>Submit the report.</li>
                  </ol>
                </div>
                <div style={{ background: '#fcf8f8', padding: '10px', borderRadius: '6px', fontSize: '12px' }}>
                  <b>What SPW does:</b>
                  <ul style={{ paddingLeft: '16px', margin: '4px 0', lineHeight: 1.4 }}>
                    <li>Removes machine capacity.</li>
                    <li>Finds overlapping operations.</li>
                    <li>Computes penalty delivery risk.</li>
                  </ul>
                  <button className="secondary" onClick={tryMachineDown} style={{ width: '100%', marginTop: '10px', fontSize: '11px', padding: '6px', borderColor: '#f3dad6', color: '#b44638' }}>Open Supervisor Tablet →</button>
                </div>
              </div>
            </div>
          )}

          {selectedProblem === 'absence' && (
            <div className="panel" style={{ background: '#fff', borderLeft: '4px solid #b77843', display: 'grid', gap: '12px' }}>
              <h3>🟠 OPERATOR ABSENCE WORKFLOW</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }} className="workbench">
                <div><ol style={{ paddingLeft: '16px', fontSize: '13px', lineHeight: 1.6 }}><li>Open <b>Supervisor Tablet</b>.</li><li>Tap <b>Operator Absent</b> preset.</li><li>Select the absent operator ID.</li><li>Submit action.</li><li>Run <b>Replan</b>.</li></ol></div>
                <div style={{ background: '#fffcf9', padding: '10px', borderRadius: '6px', fontSize: '12px' }}><b>What SPW checks:</b><ul style={{ paddingLeft: '16px', margin: '4px 0', lineHeight: 1.4 }}><li>Verifies machine qualification tags.</li><li>Identifies substitute operators.</li><li>Frees other resources to bridge gap.</li></ul><button className="secondary" onClick={tryMachineDown} style={{ width: '100%', marginTop: '10px', fontSize: '11px', padding: '6px', borderColor: '#f7e6d0', color: '#b77843' }}>Open Supervisor Tablet →</button></div>
              </div>
            </div>
          )}

          {selectedProblem === 'material' && (
            <div className="panel" style={{ background: '#fff', borderLeft: '4px solid #b77843', display: 'grid', gap: '12px' }}>
              <h3>🟡 MATERIAL DELAY WORKFLOW</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }} className="workbench">
                <div><ol style={{ paddingLeft: '16px', fontSize: '13px', lineHeight: 1.6 }}><li>Open <b>Supervisor Tablet</b>.</li><li>Tap <b>Material Missing</b> button.</li><li>Select the affected Order ID.</li><li>Enter expected arrival delay time.</li><li>Submit and Replan.</li></ol></div>
                <div style={{ background: '#fffcf9', padding: '10px', borderRadius: '6px', fontSize: '12px' }}><b>What SPW does:</b><p style={{ margin: '4px 0' }}>It locks out the first operation until the material arrival time, shifting other feasible work into the available capacity.</p><button className="secondary" onClick={tryMaterialDelay} style={{ width: '100%', marginTop: '10px', fontSize: '11px', padding: '6px', borderColor: '#f7e6d0', color: '#b77843' }}>Open Supervisor Tablet →</button></div>
              </div>
            </div>
          )}

          {selectedProblem === 'quality' && (
            <div className="panel" style={{ background: '#fff', borderLeft: '4px solid #438b4d', display: 'grid', gap: '12px' }}>
              <h3>🟣 QUALITY FAILURE (REWORK) WORKFLOW</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }} className="workbench">
                <div><ol style={{ paddingLeft: '16px', fontSize: '13px', lineHeight: 1.6 }}><li>Open <b>Supervisor Tablet</b>.</li><li>Tap <b>Rework / Scrap</b> button.</li><li>Select order ID and the operation that failed.</li><li>Enter the failed quantity.</li><li>Submit and Replan.</li></ol></div>
                <div style={{ background: '#f5f8f5', padding: '10px', borderRadius: '6px', fontSize: '12px' }}><b>What SPW does:</b><p style={{ margin: '4px 0' }}>Adds the extra cycle duration back into the active scheduling queue.</p><button className="secondary" onClick={tryRework} style={{ width: '100%', marginTop: '10px', fontSize: '11px', padding: '6px', borderColor: '#dce7dc', color: '#438b4d' }}>Open Supervisor Tablet →</button></div>
              </div>
            </div>
          )}

          {selectedProblem === 'power' && (
            <div className="panel" style={{ background: '#fff', borderLeft: '4px solid #172329', display: 'grid', gap: '12px' }}>
              <h3>⚡ POWER OUTAGE WORKFLOW</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }} className="workbench">
                <div><ol style={{ paddingLeft: '16px', fontSize: '13px', lineHeight: 1.6 }}><li>In the <b>Control Room</b> disruption panel, select the <b>Power outage</b> preset.</li><li>Set the start minute and down duration.</li><li>Run <b>Simulate Disruption</b>.</li><li>Review options.</li></ol></div>
                <div style={{ background: '#f0f3f2', padding: '10px', borderRadius: '6px', fontSize: '12px' }}><b>Decision Support:</b><p style={{ margin: '4px 0' }}>The solver runs all options and outputs the best strategy to avoid penalty bottlenecks.</p><button className="primary" onClick={tryReplanBtn} style={{ width: '100%', marginTop: '10px', fontSize: '11px', padding: '6px' }}>Simulate Power Cut →</button></div>
              </div>
            </div>
          )}

          {selectedProblem === 'urgent' && (
            <div className="panel" style={{ background: '#fff', borderLeft: '4px solid #d7ef63', display: 'grid', gap: '12px' }}>
              <h3>👑 VIP CUSTOMER ESCALATION WORKFLOW</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }} className="workbench">
                <div><ol style={{ paddingLeft: '16px', fontSize: '13px', lineHeight: 1.6 }}><li>Find the order on the <b>Order Control Board</b>.</li><li>Click the <b>Pin</b> button.</li><li>Choose <b>Pin Order FIRST</b> or select a specific operator/machine.</li><li>Enter override justification reason.</li><li>Click <b>Enforce Pin</b> to re-solve.</li></ol></div>
                <div style={{ background: '#fbfff0', padding: '10px', borderRadius: '6px', fontSize: '12px' }}><b>What SPW does:</b><p style={{ margin: '4px 0' }}>Forces the target operation to run first or on that machine, and shifts other non-frozen tasks.</p><button className="primary" onClick={tryPin} style={{ width: '100%', marginTop: '10px', fontSize: '11px', padding: '6px' }}>Open Pinning Modal →</button></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Core Workflow */}
      <div className="panel" style={{ background: '#fff', border: '1px solid #d9e0dd' }}>
        <h3 style={{ fontWeight: 800, textAlign: 'center', marginBottom: '14px' }}>The Core Scheduling Workflow</h3>
        <div className="workflow-track" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', background: '#f5f8f7', padding: '12px', borderRadius: '8px' }}>
          {workflowSteps.map((step, idx) => (
            <Fragment key={step.id}>
              <button
                className={`pill ${activeWorkflowStep === step.id ? 'good' : ''}`}
                style={{ cursor: 'pointer', minHeight: '28px', padding: '4px 10px', fontWeight: activeWorkflowStep === step.id ? 800 : 500, fontSize: '11px', border: activeWorkflowStep === step.id ? '2px solid #adc64a' : '1px solid #d6ddda' }}
                onClick={() => setActiveWorkflowStep(step.id)}
              >{step.title}</button>
              {idx < workflowSteps.length - 1 && <span style={{ color: '#abbcb7', fontSize: '12px' }}>➔</span>}
            </Fragment>
          ))}
        </div>
        <div style={{ marginTop: '14px', padding: '14px', background: '#fcfdfc', border: '1px dashed #d9e0dd', borderRadius: '6px' }}>
          <b style={{ color: '#566560', textTransform: 'uppercase', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Workflow Stage Details</b>
          <p style={{ fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
            <b>{activeWorkflowStep}:</b> {workflowSteps.find(s => s.id === activeWorkflowStep)?.desc}
          </p>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#778783' }}>
            {activeWorkflowStep === 'RECORD' && '👉 Quick commands: Machine Down, Material Missing, Rework, Operator Absent.'}
            {activeWorkflowStep === 'ANALYZE' && '👉 Stats: Affected orders, bottleneck utilization, penalty exposure.'}
            {activeWorkflowStep === 'REPLAN' && '👉 CP-SAT output: Adjusted machine loads, setup transition times, overtime hours.'}
            {activeWorkflowStep === 'COMPARE' && '👉 comparison matrix: Plan stability logs, penalty difference, cost delta.'}
            {activeWorkflowStep === 'DECIDE' && '👉 Final action: Authorize schedule release or execute customer call directives.'}
          </div>
        </div>
      </div>

      {/* 5. Live Demo Sim */}
      <div className="panel" style={{ border: '1px solid #cad8a0', background: '#fbfff0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#5f7f18' }}>
          <Play size={20} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Watch SPW respond (Live Demo Sim)</h2>
        </div>
        <p className="muted" style={{ margin: '6px 0 16px' }}>Click through to see how the solver handles a sudden grinding machine breakdown.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '18px' }}>
          {[
            { step: 1 as const, label: 'STATE A', title: 'Normal Plan', desc: 'Grinding: 96% utilized. 3 orders at risk. Deliveries on time.', color: '#5f7f18' },
            { step: 2 as const, label: 'STATE B', title: 'Disruption', desc: 'Machine GRIND-G02 breaks down for 8 hours. Penalty jumps to ₹42,000.', color: '#b44638' },
            { step: 3 as const, label: 'STATE C', title: 'Optimal Replan', desc: 'Tasks rerouted. Overtime used. Penalty exposure reduced to ₹8,000.', color: '#adc64a' },
          ].map(s => (
            <div key={s.step} style={{ padding: '10px', background: exampleStep === s.step ? '#fff' : '#f5f7f6', opacity: exampleStep === s.step ? 1 : 0.7, border: exampleStep === s.step ? `2px solid ${s.color}` : '1px solid #d9e0dd', borderRadius: '6px' }}>
              <span style={{ fontSize: '10px', color: '#778783' }}>{s.label}</span>
              <b style={{ display: 'block', margin: '4px 0', fontSize: '13px' }}>{s.title}</b>
              <p style={{ fontSize: '11px', margin: 0, color: '#65746f' }}>{s.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8e5' }}>
          {exampleStep === 1 && (
            <div>
              <p style={{ fontSize: '13px', lineHeight: 1.5, margin: '0 0 12px' }}>The shop is running smoothly. Orders are scheduled sequentially. Grinding bottleneck load is high but fully managed.</p>
              <button
                className="secondary"
                style={{ borderColor: '#b44638', color: '#b44638', fontSize: '12px' }}
                disabled={exampleLoading}
                onClick={async () => {
                  setExampleLoading(true)
                  try {
                    await onAnalyze({ preset: 'grinding_down_8', machine_id: 'GRIND-G02', downtime_minutes: 480 })
                    setExampleStep(2)
                  } catch {
                    setExampleStep(2)
                  } finally {
                    setExampleLoading(false)
                  }
                }}
              >
                {exampleLoading ? 'Simulating Disruption...' : 'Inject Breakdown ➔'}
              </button>
            </div>
          )}
          {exampleStep === 2 && (
            <div>
              <b style={{ color: '#b44638', display: 'block', fontSize: '13px', marginBottom: '6px' }}>⚠️ 8-Hour Breakdown Injected on GRIND-G02</b>
              <p style={{ fontSize: '13px', lineHeight: 1.5, margin: '0 0 12px' }}>Without a replan, the backlog of tasks builds up. Five critical orders will miss their promise dates, costing <b>₹42,000</b> in late penalty exposure.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="secondary" style={{ fontSize: '11px' }} onClick={() => setExampleStep(1)}>Back</button>
                <button
                  className="primary"
                  style={{ fontSize: '12px' }}
                  onClick={async () => {
                    setExampleLoading(true)
                    try {
                      await onReplan('cheapest', { preset: 'grinding_down_8', machine_id: 'GRIND-G02', downtime_minutes: 480 })
                      setExampleStep(3)
                    } catch {
                      setExampleStep(3)
                    } finally {
                      setExampleLoading(false)
                    }
                  }}
                  disabled={exampleLoading}
                >
                  {exampleLoading ? 'Solving with CP-SAT...' : 'Trigger Replan ➔'}
                </button>
              </div>
            </div>
          )}
          {exampleStep === 3 && (
            <div>
              <b style={{ color: '#5f7f18', display: 'block', fontSize: '13px', marginBottom: '6px' }}>✓ CP-SAT Solver Re-plan Generated successfully</b>
              <p style={{ fontSize: '13px', lineHeight: 1.5, margin: '0 0 12px' }}>The solver has shifted 7 operations to other grinding machines and scheduled controlled overtime. Penalties are cut from <b>₹42,000 to ₹8,000</b>. Incremental setup and overtime cost is <b>₹18,500</b>, saving the owner <b>₹15,500</b> net!</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="secondary" style={{ fontSize: '11px' }} onClick={() => setExampleStep(2)}>Back</button>
                <button className="primary" style={{ fontSize: '12px' }} onClick={() => onSetView('control')}>See New Schedule →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. FAQ */}
      <div className="panel" style={{ background: '#fff' }}>
        <h3 style={{ fontWeight: 800, marginBottom: '14px' }}>Production Concepts FAQ</h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {[
            { q: 'What is a bottleneck?', a: 'A bottleneck is the work center with the highest capacity load compared to its available hours. Grinding is the default bottleneck at SPW, running at 96% capacity.' },
            { q: 'What is a changeover?', a: 'A changeover (or setup time) is the cleanup and adjustment duration needed when a machine transitions from processing one part-family to another. The solver minimizes these to avoid idle time.' },
            { q: 'Why does the schedule move jobs during a replan?', a: 'When a machine breaks down, the solver shifts operations to alternative qualified machines or schedules them after the repair window.' },
            { q: 'Why is overtime recommended?', a: 'If a disruption reduces available shift capacity, scheduling overtime (up to 18 hours per day) is often cheaper than suffering late-delivery penalty charges.' },
            { q: 'Why did my order get delayed?', a: 'Orders get delayed if another order has a tighter delivery deadline, higher late penalties, or shares a part-family with adjacent jobs (enabling massive setup time savings).' },
            { q: 'What does "at risk" mean?', a: 'An order is flagged as "at risk" if it is scheduled to finish within a 12-hour buffer window before its customer promise date.' },
          ].map((faq) => (
            <div key={faq.q} style={{ borderBottom: '1px solid #e2e8e5', paddingBottom: '8px' }}>
              <button
                onClick={() => setExpandedFaq(expandedFaq === faq.q ? null : faq.q)}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', fontWeight: 800, fontSize: '13px', padding: '8px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: '#132025' }}
              >
                <span>{faq.q}</span>
                <span>{expandedFaq === faq.q ? '−' : '+'}</span>
              </button>
              {expandedFaq === faq.q && <p style={{ margin: '4px 0 8px', fontSize: '13px', color: '#53635f', lineHeight: 1.5 }}>{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* 7. Footer CTA */}
      <div className="panel" style={{ background: '#152229', color: '#dfe8e5', textAlign: 'center', padding: '34px 20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>You don't need to understand the algorithm.</h2>
        <p style={{ color: '#9bb0a9', fontSize: '14px', marginBottom: '24px' }}>Just tell SPW what changed, and let the OR-Tools optimizer handle the math.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', maxWidth: '800px', margin: '0 auto 30px', textAlign: 'left', fontSize: '13px' }}>
          <div>
            <div style={{ margin: '6px 0' }}>Machine stopped? ➔ <b>Machine Down</b></div>
            <div style={{ margin: '6px 0' }}>Material late? ➔ <b>Material Missing</b></div>
            <div style={{ margin: '6px 0' }}>Bad parts? ➔ <b>Rework</b></div>
          </div>
          <div>
            <div style={{ margin: '6px 0' }}>Customer escalated? ➔ <b>Pin first</b></div>
            <div style={{ margin: '6px 0' }}>Something changed? ➔ <b>Analyze Impact</b></div>
            <div style={{ margin: '6px 0' }}>Need a new plan? ➔ <b>Replan</b></div>
          </div>
        </div>
        <button className="primary" onClick={() => onSetView('control')} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 800 }}>Open Production Control Room →</button>
      </div>
    </section>
  )
}
