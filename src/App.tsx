import { Loader2, CheckCircle2, XCircle, Factory, Gauge, BarChart3, ShieldCheck, HelpCircle, RefreshCcw } from 'lucide-react'
import { useScheduler } from './hooks/useScheduler'
import { KpiGrid } from './components/dashboard/KpiGrid'
import { DispatchList, OrderRisk } from './components/dashboard/DispatchList'
import { DecisionCard } from './components/dashboard/DecisionCard'
import { HealthPanel } from './components/dashboard/HealthPanel'
import { Panel } from './components/layout/Panel'
import { Gantt } from './components/schedule/Gantt'
import { DefenseMode } from './components/schedule/DefenseMode'
import { DisruptionPanel, ComparePanel, StrategyPage } from './components/disruptions/DisruptionPanel'
import { SupervisorTablet } from './components/supervisor/SupervisorTablet'
import { ExplanationModal, PinningModal, ConcurrencyModal } from './components/common/Overlays'
import { GuideView } from './components/guide/GuideView'
import { timeLabel } from './utils/format'
import './App.css'

function App() {
  const s = useScheduler()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Factory size={20} /></span>
          <span>Sridhar Precision Works</span>
        </div>
        <nav>
          <button className={s.view === 'control' ? 'active' : ''} onClick={() => s.setView('control')}><Gauge size={17} /> Control room</button>
          <button className={s.view === 'strategies' ? 'active' : ''} onClick={s.compareStrategies}><BarChart3 size={17} /> Compare strategies</button>
          <button className={s.view === 'defense' ? 'active' : ''} onClick={() => s.setView('defense')}><ShieldCheck size={17} /> Defense mode</button>
          <button className={s.view === 'supervisor' ? 'active' : ''} onClick={() => s.setView('supervisor')}><Factory size={17} /> Supervisor Tablet</button>
          <button className={s.view === 'guide' ? 'active' : ''} onClick={() => s.setView('guide')}><HelpCircle size={17} /> Guide</button>
        </nav>
        <div className="sidebar-stat">
          <span>Demo Mode</span>
          <b>{s.activePlan.machines.length || 14} machines</b>
          <b>{s.activePlan.kpis.orders || 25} orders</b>
          <b>{s.activePlan.kpis.operations || 101} operations</b>
        </div>
        <button className="reset-button" onClick={s.resetDemo}><RefreshCcw size={15} /> Reset demo</button>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">Tuesday 11:00 AM · deterministic manufacturing simulator</p>
            <h1>Production Scheduling & Replanning</h1>
            <p className="subhead">Baseline schedule → real disruption → OR-Tools replan → costed owner decision.</p>
          </div>
          <div className="status-stack">
            <span className={s.activePlan.validated ? 'pill good' : 'pill bad'}>
              {s.activePlan.validated ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {s.activePlan.validated ? 'Validated' : 'Not valid'}
            </span>
            <span className="pill">{s.activePlan.plan_version}</span>
          </div>
        </header>

        {s.error && <div className="banner error">{s.error}<button className="reset-button" style={{ marginLeft: '12px', padding: '4px 8px' }} onClick={() => s.setError('')}>Dismiss</button></div>}
        {s.loading && <div className="banner"><Loader2 className="spin" size={17} /> {s.loading}</div>}

        {/* 1. Control Room View */}
        {s.view === 'control' && (
          <>
            <KpiGrid plan={s.activePlan} />
            <section className="workbench">
              <div className="primary-column">
                <Panel title="2-week Gantt schedule" eyebrow="Baseline and replanned operations">
                  <Gantt plan={s.activePlan} />
                </Panel>

                {/* Order Control Board with Explain & Pin Actions */}
                <Panel title="Order & Operation Control Board" eyebrow="Actions for explainability and manual override constraints">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="control-board-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Customer</th>
                          <th>Part</th>
                          <th>Qty</th>
                          <th>Due Window</th>
                          <th>Estimated Lateness</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.activePlan.orders.map((o) => (
                          <tr key={o.id}>
                            <td><b>{o.id}</b></td>
                            <td>{o.customer}</td>
                            <td>{o.part}</td>
                            <td>{o.quantity} pcs</td>
                            <td>{timeLabel(o.due)}</td>
                            <td className={o.late_minutes ? 'bad-text' : ''}>
                              {o.late_minutes ? `${Math.round(o.late_minutes / 60)}h late` : 'On time'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button className="secondary" style={{ padding: '4px 8px', fontSize: '11px', minHeight: 'auto' }} onClick={() => s.handleFetchExplanation(o.id)}>Why?</button>
                                <button className="primary" style={{ padding: '4px 8px', fontSize: '11px', minHeight: 'auto' }} onClick={() => {
                                  const firstOp = s.activePlan.operations.find(op => op.order_id === o.id);
                                  if (firstOp) {
                                    s.setPinningOp(firstOp)
                                    s.setPinType('first')
                                    s.setPinValue('')
                                  }
                                }}>Pin</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                <Panel title="Disruption & impact" eyebrow="If we do nothing">
                  <DisruptionPanel
                    preset={s.preset}
                    setPreset={s.setPreset}
                    custom={s.custom}
                    setCustom={s.setCustom}
                    impact={s.impact}
                    selectedPresetLabel={s.selectedPresetLabel}
                    onAnalyze={s.analyzeImpact}
                    onReplan={() => s.runReplan()}
                  />
                </Panel>
                <Panel title="Old plan vs new plan" eyebrow="Calculated from schedule comparison">
                  <ComparePanel baseline={s.baseline} plan={s.activePlan} />
                </Panel>
              </div>
              <div className="side-column">
                <Panel title="What do I run now?" eyebrow="Supervisor dispatch">
                  <DispatchList operations={s.nextDispatch} />
                </Panel>
                <Panel title="At-risk orders" eyebrow="Customer promise watch">
                  <OrderRisk orders={s.topOrders} />
                </Panel>
                <DecisionCard plan={s.activePlan} impact={s.impact} />
                <HealthPanel plan={s.activePlan} onValidate={s.validateSchedule} />
              </div>
            </section>
          </>
        )}

        {/* 2. Strategies View */}
        {s.view === 'strategies' && (
          <StrategyPage
            strategies={s.strategies}
            recommendation={s.strategyRecommendation}
            loading={s.loading}
            onRun={s.compareStrategies}
          />
        )}

        {/* 3. Defense Mode View */}
        {s.view === 'defense' && (
          <DefenseMode
            step={s.defenseStep}
            plan={s.activePlan}
            impact={s.impact}
            strategies={s.strategies}
            onNext={s.nextDefense}
            onImpact={s.analyzeImpact}
            onReplan={() => s.runReplan()}
            onStrategies={s.compareStrategies}
          />
        )}

        {/* 4. Supervisor View */}
        {s.view === 'supervisor' && (
          <SupervisorTablet
            plan={s.activePlan}
            nextDispatch={s.nextDispatch}
            supervisorLang={s.supervisorLang}
            setSupervisorLang={s.setSupervisorLang}
            supervisorTab={s.supervisorTab}
            setSupervisorTab={s.setSupervisorTab}
            networkStatus={s.networkStatus}
            offlineQueue={s.offlineQueue}
            onToggleNetwork={s.toggleNetwork}
            onReport={s.reportSupervisorDisruption}
          />
        )}

        {/* 5. Guide View */}
        {s.view === 'guide' && (
          <GuideView
            plan={s.activePlan}
            baseline={s.baseline}
            impact={s.impact}
            onResetDemo={s.resetDemo}
            onReplan={s.runReplan}
            onAnalyze={s.analyzeImpact}
            onSetView={(v) => s.setView(v)}
            onSetPinningOp={(op) => {
              s.setPinningOp(op)
              s.setPinType('first')
              s.setPinValue('')
              s.setView('control')
            }}
            onSetSupervisorTab={(tab) => {
              s.setView('supervisor')
              s.setSupervisorTab(tab)
            }}
          />
        )}

        {/* 6. Modals & Overlays */}
        {s.orderExplanation && (
          <ExplanationModal
            selectedOrderId={s.selectedOrderId}
            orderExplanation={s.orderExplanation}
            onClose={() => s.setOrderExplanation(null)}
          />
        )}

        {s.pinningOp && (
          <PinningModal
            pinningOp={s.pinningOp}
            pinType={s.pinType}
            setPinType={s.setPinType}
            pinValue={s.pinValue}
            setPinValue={s.setPinValue}
            pinReason={s.pinReason}
            setPinReason={s.setPinReason}
            plan={s.activePlan}
            onApply={s.handleApplyOverride}
            onClose={() => s.setPinningOp(null)}
          />
        )}

        {s.concurrencyConflict && (
          <ConcurrencyModal
            conflict={s.concurrencyConflict}
            onRefresh={s.refreshPlan}
          />
        )}
      </main>
    </div>
  )
}

export default App
