import type { Impact, Plan, StrategyResult } from '../../types'
import { Metric } from '../layout/Panel'
import { presets } from '../../data/constants'
import type { PresetId } from '../../data/constants'
import { money } from '../../utils/format'
import { AlertTriangle, Play, Wrench } from 'lucide-react'

interface DisruptionPanelProps {
  preset: string
  setPreset: (value: PresetId) => void
  custom: { start_minute: number; downtime_minutes: number; machine_id: string; operator_id: string }
  setCustom: (value: { start_minute: number; downtime_minutes: number; machine_id: string; operator_id: string }) => void
  impact: Impact | null
  selectedPresetLabel: string
  onAnalyze: () => void
  onReplan: () => void
}

export function DisruptionPanel(props: DisruptionPanelProps) {
  return (
    <div className="disruption-layout">
      <div>
        <label className="field-label">Preset</label>
        <div className="preset-grid">
          {presets.map(([id, label]) => (
            <button className={props.preset === id ? 'preset active' : 'preset'} key={id} onClick={() => props.setPreset(id)}>
              <Wrench size={15} />
              {label}
            </button>
          ))}
        </div>
        <div className="custom-grid">
          <label>
            Machine
            <input value={props.custom.machine_id} onChange={(event) => props.setCustom({ ...props.custom, machine_id: event.target.value })} />
          </label>
          <label>
            Operator
            <input value={props.custom.operator_id} onChange={(event) => props.setCustom({ ...props.custom, operator_id: event.target.value })} />
          </label>
          <label>
            Start minute
            <input type="number" value={props.custom.start_minute} onChange={(event) => props.setCustom({ ...props.custom, start_minute: Number(event.target.value) })} />
          </label>
          <label>
            Down minutes
            <input type="number" value={props.custom.downtime_minutes} onChange={(event) => props.setCustom({ ...props.custom, downtime_minutes: Number(event.target.value) })} />
          </label>
        </div>
        <div className="action-row">
          <button className="secondary" onClick={props.onAnalyze}><AlertTriangle size={16} /> Simulate disruption</button>
          <button className="primary" onClick={props.onReplan}><Play size={16} /> Replan with OR-Tools</button>
        </div>
      </div>
      <div className="impact-card">
        <p className="eyebrow">{props.selectedPresetLabel}</p>
        <h3>{props.impact?.headline ?? 'Impact analysis will appear here'}</h3>
        {props.impact ? (
          <div className="impact-grid">
            <Metric label="Affected orders" value={props.impact.affected_orders} />
            <Metric label="Affected operations" value={props.impact.affected_operations} />
            <Metric label="Expected late orders" value={props.impact.expected_late_orders} />
            <Metric label="Expected late minutes" value={props.impact.expected_late_minutes} />
            <Metric label="Expected penalties" value={money(props.impact.expected_penalties)} />
            <Metric label="Expected overtime" value={money(props.impact.expected_overtime)} />
            <Metric label="Bottleneck impact" value={props.impact.bottleneck_impact} />
            <Metric label="Do-nothing cost" value={money(props.impact.do_nothing_total_cost)} />
          </div>
        ) : (
          <p className="muted">Press Simulate Disruption to calculate the no-action outcome from the baseline schedule.</p>
        )}
      </div>
    </div>
  )
}

export function ComparePanel({ baseline, plan }: { baseline: Plan | null; plan: Plan }) {
  const changeRows = [
    ['Operations moved', plan.changes.operations_moved],
    ['Machines changed', plan.changes.machines_changed],
    ['Operators changed', plan.changes.operators_changed],
    ['Jobs delayed', plan.changes.jobs_delayed],
    ['Jobs pulled forward', plan.changes.jobs_pulled_forward],
    ['Additional overtime', money(plan.changes.additional_overtime)],
    ['Additional changeovers', `${plan.changes.additional_changeovers} h`],
    ['Penalty difference', money(plan.changes.penalty_difference)],
    ['Execution cost', money(plan.changes.execution_cost ?? 0)],
    ['Total cost difference', money(plan.changes.total_cost_difference)],
  ]
  return (
    <div className="compare-layout">
      <div className="plan-snapshot">
        <h3>Old plan</h3>
        <b>{baseline?.plan_version ?? 'V001'}</b>
        <span>{money(baseline?.kpis.total_cost ?? 0)} total cost</span>
        <span>{baseline?.kpis.on_time ?? 0}% on time</span>
      </div>
      <div className="plan-snapshot new">
        <h3>New plan</h3>
        <b>{plan.plan_version}</b>
        <span>{money(plan.kpis.total_cost)} total cost</span>
        <span>{plan.kpis.on_time}% on time</span>
      </div>
      <div className="change-table">
        {changeRows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <div className="moved-list">
        {plan.changes.moved_operations.slice(0, 8).map((move) => (
          <article key={move.operation_id}>
            <b>{move.order_id}</b>
            <span>{move.part}: {move.from} → {move.to}</span>
            <small>{move.machine_from} → {move.machine_to}; {move.operator_from} → {move.operator_to}</small>
          </article>
        ))}
      </div>
    </div>
  )
}

export function StrategyPage(props: { strategies: StrategyResult[]; recommendation: string; loading: string; onRun: () => void }) {
  const labels: Record<string, string> = { cheapest: 'Cheapest', on_time: 'Most On-Time', robust: 'Most Robust' }
  const rows = [
    ['Total Cost', 'total_cost', money],
    ['Penalties', 'penalties', money],
    ['Overtime', 'overtime', money],
    ['On-Time %', 'on_time', (value: number) => `${value}%`],
    ['Changeover Hours', 'changeover_hours', (value: number) => `${value} h`],
    ['Bottleneck Utilization', 'bottleneck_utilization', (value: number) => `${value}%`],
    ['Robustness Score', 'robustness_score', (value: number) => `${value}`],
  ] as const

  return (
    <section className="strategy-page">
      <div className="section-title">
        <div>
          <p className="eyebrow">Three strategy solves</p>
          <h2>Compare Strategies</h2>
        </div>
        <button className="primary" onClick={props.onRun}><Play size={16} /> Run all strategies</button>
      </div>
      {props.loading && props.strategies.length === 0 ? <div className="empty-state">Solving cheapest, most on-time and most robust variants...</div> : (
        <div className="strategy-table">
          <div className="strategy-row head">
            <span>Metric</span>
            {props.strategies.map((strategy) => <b key={strategy.strategy}>{labels[strategy.strategy]}</b>)}
          </div>
          {rows.map(([label, key, format]) => (
            <div className="strategy-row" key={label}>
              <span>{label}</span>
              {props.strategies.map((strategy) => <b key={strategy.strategy}>{format(strategy[key])}</b>)}
            </div>
          ))}
        </div>
      )}
      {props.recommendation && <div className="strategy-reco"><Play size={18} /> {props.recommendation}</div>}
    </section>
  )
}
