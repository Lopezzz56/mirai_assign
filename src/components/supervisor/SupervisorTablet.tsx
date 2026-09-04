import { useState, useEffect } from 'react'
import type { Operation, Plan } from '../../types'
import { timeLabel } from '../../utils/format'
import { translations } from '../../data/constants'
import type { LangKey } from '../../data/constants'
import { AlertTriangle, Gauge, RefreshCcw, SlidersHorizontal, Wifi, WifiOff, Wrench, ArrowLeft, Check, Users } from 'lucide-react'

interface SupervisorTabletProps {
  plan: Plan
  nextDispatch: Operation[]
  supervisorLang: LangKey
  setSupervisorLang: (lang: LangKey) => void
  supervisorTab: 'jobs' | 'alerts' | 'shift'
  setSupervisorTab: (tab: 'jobs' | 'alerts' | 'shift') => void
  networkStatus: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNCED'
  offlineQueue: Array<{ endpoint: string; payload: any }>
  onToggleNetwork: () => void
  onReport: (type: string, detail: any) => void
}

export function SupervisorTablet(props: SupervisorTabletProps) {
  const t = translations[props.supervisorLang]
  const activePlan = props.plan

  // Form display state: 'breakdown' | 'absence' | 'material' | 'rework' | null
  const [activeForm, setActiveForm] = useState<'breakdown' | 'absence' | 'material' | 'rework' | null>(null)

  // Form Inputs state
  const [machineId, setMachineId] = useState('GRIND-G02')
  const [downtimeMinutes, setDowntimeMinutes] = useState(480)

  const [operatorId, setOperatorId] = useState('OP-GRIND-2')

  const [materialOrderId, setMaterialOrderId] = useState('')
  const [materialDelayMinutes, setMaterialDelayMinutes] = useState(720)

  const [reworkOrderId, setReworkOrderId] = useState('')
  const [reworkOperationId, setReworkOperationId] = useState('')
  const [reworkQuantity, setReworkQuantity] = useState(50)

  // Reset dropdown defaults when plan loads
  useEffect(() => {
    if (activePlan.machines.length > 0) {
      setMachineId(activePlan.machines[0].id)
    }
    if (activePlan.operators.length > 0) {
      setOperatorId(activePlan.operators[0].id)
    }
    if (activePlan.orders.length > 0) {
      setMaterialOrderId(activePlan.orders[0].id)
      setReworkOrderId(activePlan.orders[0].id)
    }
  }, [activePlan])

  // Update operation dropdown when rework order changes
  useEffect(() => {
    if (reworkOrderId) {
      const ops = activePlan.operations.filter(op => op.order_id === reworkOrderId)
      if (ops.length > 0) {
        setReworkOperationId(ops[0].operation_id)
      } else {
        setReworkOperationId('')
      }
    }
  }, [reworkOrderId, activePlan.operations])

  // Supervisor current job details
  const supervisorJob = activePlan.operations.find(
    (op: any) => op.work_center === 'GRIND' && op.status === 'scheduled'
  ) as Operation | undefined

  const handleSubmitBreakdown = (e: React.FormEvent) => {
    e.preventDefault()
    props.onReport('machine-breakdown', {
      machine_id: machineId,
      downtime_minutes: Number(downtimeMinutes),
    })
    setActiveForm(null)
  }

  const handleSubmitAbsence = (e: React.FormEvent) => {
    e.preventDefault()
    props.onReport('operator-absence', {
      operator_id: operatorId,
    })
    setActiveForm(null)
  }

  const handleSubmitMaterial = (e: React.FormEvent) => {
    e.preventDefault()
    props.onReport('material-delay', {
      order_id: materialOrderId,
      material_delay_minutes: Number(materialDelayMinutes),
    })
    setActiveForm(null)
  }

  const handleSubmitRework = (e: React.FormEvent) => {
    e.preventDefault()
    props.onReport('rework', {
      order_id: reworkOrderId,
      operation_id: reworkOperationId,
      rework_quantity: Number(reworkQuantity),
    })
    setActiveForm(null)
  }

  return (
    <section className="supervisor-tablet">
      <div className="supervisor-header">
        <div>
          <h2>{t.goodMorning}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
            <button className={`net-indicator ${props.networkStatus.toLowerCase()}`} onClick={props.onToggleNetwork} style={{ background: 'transparent', padding: 0 }}>
              {props.networkStatus === 'OFFLINE' ? <WifiOff size={16} /> : <Wifi size={16} />}
              {props.networkStatus === 'OFFLINE' ? `${t.offline} (${props.offlineQueue.length})` : (props.networkStatus === 'SYNCING' ? t.syncing : t.online)}
            </button>
          </div>
        </div>
        <div className="lang-selector">
          <button className={`lang-btn ${props.supervisorLang === 'en' ? 'active' : ''}`} onClick={() => props.setSupervisorLang('en')}>EN</button>
          <button className={`lang-btn ${props.supervisorLang === 'kn' ? 'active' : ''}`} onClick={() => props.setSupervisorLang('kn')}>ಕನ್ನಡ</button>
          <button className={`lang-btn ${props.supervisorLang === 'ta' ? 'active' : ''}`} onClick={() => props.setSupervisorLang('ta')}>தமிழ்</button>
        </div>
      </div>

      <div className="supervisor-body">
        {props.supervisorTab === 'jobs' && (
          <div className="supervisor-home">
            {/* If no active form, show main dashboard buttons */}
            {!activeForm ? (
              <>
                <div className="shift-card">
                  <div className="shift-card-header">
                    <h3>{t.currentShift}</h3>
                    <span><b>A</b></span>
                  </div>
                  <div className="shift-time">09:42 {t.timeLeft}</div>
                </div>

                <div className="current-job-card">
                  <h4>{t.nextJob}</h4>
                  {supervisorJob ? (
                    <>
                      <div className="current-job-title">{supervisorJob.order_id} · {supervisorJob.part}</div>
                      <div className="current-job-details">
                        {supervisorJob.operation} · Machine: {supervisorJob.machine_id} · Operator: {supervisorJob.operator} · {supervisorJob.quantity} pcs
                        {supervisorJob.setup > 0 && <span style={{ color: '#b77843', display: 'block', marginTop: '4px' }}>⚠️ {t.setupRequired}: {supervisorJob.setup} min</span>}
                      </div>
                    </>
                  ) : (
                    <p>{t.noJob}</p>
                  )}
                  <button className="primary btn-large complete" style={{ width: '100%', minHeight: 'auto', padding: '14px' }} onClick={() => props.onReport('rework', { rework_quantity: 0 })}>
                    {t.jobComplete}
                  </button>
                </div>

                <div className="supervisor-actions-grid">
                  <button className="btn-large down" onClick={() => setActiveForm('breakdown')}>
                    <Wrench size={22} /> {t.machineDown}
                    <small style={{ fontSize: '10px', fontWeight: 500, color: '#963b32', marginTop: '2px' }}>Report machine out of service</small>
                  </button>
                  <button className="btn-large absence" onClick={() => setActiveForm('absence')}>
                    <Users size={22} /> Operator Absent
                    <small style={{ fontSize: '10px', fontWeight: 500, color: '#4a3b96', marginTop: '2px' }}>Report shift employee absence</small>
                  </button>
                  <button className="btn-large missing" onClick={() => setActiveForm('material')}>
                    <AlertTriangle size={22} /> {t.materialMissing}
                    <small style={{ fontSize: '10px', fontWeight: 500, color: '#8d5a2a', marginTop: '2px' }}>Report raw-materials delay</small>
                  </button>
                  <button className="btn-large rework" onClick={() => setActiveForm('rework')}>
                    <RefreshCcw size={22} /> {t.reworkScrap}
                    <small style={{ fontSize: '10px', fontWeight: 500, color: '#346b3c', marginTop: '2px' }}>Report part failure / rework needs</small>
                  </button>
                </div>
              </>
            ) : (
              /* If active form, render it */
              <div className="panel" style={{ background: '#fff', border: '1px solid #d9e0dd', padding: '20px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <button className="secondary" style={{ padding: '6px 10px', minHeight: 'auto' }} onClick={() => setActiveForm(null)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                    {activeForm === 'breakdown' && `Report ${t.machineDown}`}
                    {activeForm === 'absence' && 'Report Operator Absence'}
                    {activeForm === 'material' && `Report ${t.materialMissing}`}
                    {activeForm === 'rework' && `Report ${t.reworkScrap}`}
                  </h3>
                </div>

                {/* Form Explanation Box */}
                <div style={{ padding: '12px', background: '#f5f7f6', borderLeft: '4px solid #adc64a', borderRadius: '4px', fontSize: '12px', color: '#44524f', marginBottom: '18px', lineHeight: 1.4 }}>
                  {activeForm === 'breakdown' && (
                    <>
                      💡 <b>What this does:</b> Removes the selected machine's capacity starting at the current schedule moment. The solver will automatically search for compatible alternative machines or queue tasks behind the repair window to minimize late-delivery penalty risk.
                    </>
                  )}
                  {activeForm === 'absence' && (
                    <>
                      💡 <b>What this does:</b> Marks the selected operator as unavailable for the shift. The solver will dynamically look for other qualified crew members with matching skills to shift work centers and balance throughput.
                    </>
                  )}
                  {activeForm === 'material' && (
                    <>
                      💡 <b>What this does:</b> Freezes start times for the selected order until the materials are expected to arrive. The solver fills the empty queue slots with other ready tasks to keep machines utilized.
                    </>
                  )}
                  {activeForm === 'rework' && (
                    <>
                      💡 <b>What this does:</b> Adds the failure quantity cycle back into the active scheduling pipeline for the specific operation. Subsequent operations on this order will automatically adjust downstream.
                    </>
                  )}
                </div>

                {/* Form Elements */}
                {activeForm === 'breakdown' && (
                  <form onSubmit={handleSubmitBreakdown} style={{ display: 'grid', gap: '14px' }}>
                    <label style={{ display: 'block' }}>
                      <b style={{ fontSize: '13px' }}>Select Broken Machine</b>
                      <select className="preset" style={{ width: '100%', marginTop: '6px', height: '40px' }} value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                        {activePlan.machines.map(m => (
                          <option key={m.id} value={m.id}>{m.id} - {m.name} ({m.center})</option>
                        ))}
                      </select>
                    </label>

                    <label style={{ display: 'block' }}>
                      <b style={{ fontSize: '13px' }}>Estimated repair downtime (minutes)</b>
                      <input type="number" style={{ font: '13px var(--sans)', marginTop: '6px' }} value={downtimeMinutes} onChange={(e) => setDowntimeMinutes(Number(e.target.value))} min={1} />
                    </label>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button type="submit" className="primary btn-large" style={{ flex: 1, minHeight: '44px', padding: '10px' }}>
                        <Check size={18} /> Submit Report
                      </button>
                    </div>
                  </form>
                )}

                {activeForm === 'absence' && (
                  <form onSubmit={handleSubmitAbsence} style={{ display: 'grid', gap: '14px' }}>
                    <label style={{ display: 'block' }}>
                      <b style={{ fontSize: '13px' }}>Select Absent Operator</b>
                      <select className="preset" style={{ width: '100%', marginTop: '6px', height: '40px' }} value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
                        {activePlan.operators.map(op => (
                          <option key={op.id} value={op.id}>{op.name} ({op.id}) - skills: {op.skills.join(', ')}</option>
                        ))}
                      </select>
                    </label>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button type="submit" className="primary btn-large" style={{ flex: 1, minHeight: '44px', padding: '10px' }}>
                        <Check size={18} /> Submit Report
                      </button>
                    </div>
                  </form>
                )}

                {activeForm === 'material' && (
                  <form onSubmit={handleSubmitMaterial} style={{ display: 'grid', gap: '14px' }}>
                    <label style={{ display: 'block' }}>
                      <b style={{ fontSize: '13px' }}>Select Affected Order</b>
                      <select className="preset" style={{ width: '100%', marginTop: '6px', height: '40px' }} value={materialOrderId} onChange={(e) => setMaterialOrderId(e.target.value)}>
                        {activePlan.orders.map(o => (
                          <option key={o.id} value={o.id}>{o.id} - {o.customer} ({o.part})</option>
                        ))}
                      </select>
                    </label>

                    <label style={{ display: 'block' }}>
                      <b style={{ fontSize: '13px' }}>Expected raw material delay (minutes)</b>
                      <input type="number" style={{ font: '13px var(--sans)', marginTop: '6px' }} value={materialDelayMinutes} onChange={(e) => setMaterialDelayMinutes(Number(e.target.value))} min={1} />
                    </label>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button type="submit" className="primary btn-large" style={{ flex: 1, minHeight: '44px', padding: '10px' }}>
                        <Check size={18} /> Submit Report
                      </button>
                    </div>
                  </form>
                )}

                {activeForm === 'rework' && (
                  <form onSubmit={handleSubmitRework} style={{ display: 'grid', gap: '14px' }}>
                    <label style={{ display: 'block' }}>
                      <b style={{ fontSize: '13px' }}>Select Order ID</b>
                      <select className="preset" style={{ width: '100%', marginTop: '6px', height: '40px' }} value={reworkOrderId} onChange={(e) => setReworkOrderId(e.target.value)}>
                        {activePlan.orders.map(o => (
                          <option key={o.id} value={o.id}>{o.id} - {o.customer} ({o.part})</option>
                        ))}
                      </select>
                    </label>

                    <label style={{ display: 'block' }}>
                      <b style={{ fontSize: '13px' }}>Select Failed Operation</b>
                      <select className="preset" style={{ width: '100%', marginTop: '6px', height: '40px' }} value={reworkOperationId} onChange={(e) => setReworkOperationId(e.target.value)}>
                        {activePlan.operations
                          .filter(op => op.order_id === reworkOrderId)
                          .map(op => (
                            <option key={op.operation_id} value={op.operation_id}>{op.operation} on {op.machine_id} ({op.operator})</option>
                          ))}
                      </select>
                    </label>

                    <label style={{ display: 'block' }}>
                      <b style={{ fontSize: '13px' }}>Enter failed/rework parts quantity</b>
                      <input type="number" style={{ font: '13px var(--sans)', marginTop: '6px' }} value={reworkQuantity} onChange={(e) => setReworkQuantity(Number(e.target.value))} min={1} />
                    </label>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button type="submit" className="primary btn-large" style={{ flex: 1, minHeight: '44px', padding: '10px' }}>
                        <Check size={18} /> Submit Report
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {props.supervisorTab === 'alerts' && (
          <div className="dispatch-list">
            <h3>Active Disruption Scenarios</h3>
            {(activePlan as any).disruption ? (
              <article className="dispatch" style={{ borderColor: '#ead8c7', background: '#fff8ef' }}>
                <b style={{ color: '#b44638' }}>{(activePlan as any).disruption.preset.toUpperCase().replaceAll('_', ' ')}</b>
                <span>Downtime: {(activePlan as any).disruption.downtime_minutes} min</span>
                <small>Machine: {(activePlan as any).disruption.machine_id} · Operator: {(activePlan as any).disruption.operator_id}</small>
              </article>
            ) : (
              <p className="muted">No simulated disruptions are currently active.</p>
            )}
          </div>
        )}

        {props.supervisorTab === 'shift' && (
          <div className="dispatch-list">
            <h3>{t.currentShift} Queue</h3>
            {props.nextDispatch.map((op) => (
              <article className="dispatch" key={op.operation_id}>
                <b>{op.order_id}</b>
                <span>{op.operation} ({op.quantity} pcs)</span>
                <small>{op.machine_id} · {op.operator} · Starts {timeLabel(op.start)}</small>
              </article>
            ))}
          </div>
        )}
      </div>

      <nav className="supervisor-nav">
        <button className={`supervisor-nav-item ${props.supervisorTab === 'jobs' ? 'active' : ''}`} onClick={() => props.setSupervisorTab('jobs')}>
          <Gauge size={18} />
          <span>{t.jobs}</span>
        </button>
        <button className={`supervisor-nav-item ${props.supervisorTab === 'alerts' ? 'active' : ''}`} onClick={() => props.setSupervisorTab('alerts')}>
          <AlertTriangle size={18} />
          <span>{t.alerts}</span>
        </button>
        <button className={`supervisor-nav-item ${props.supervisorTab === 'shift' ? 'active' : ''}`} onClick={() => props.setSupervisorTab('shift')}>
          <SlidersHorizontal size={18} />
          <span>{t.shift}</span>
        </button>
      </nav>
    </section>
  )
}
