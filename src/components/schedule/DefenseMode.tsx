import type { Impact, Plan, StrategyResult } from '../../types'
import { defenseSteps } from '../../data/constants'
import { money } from '../../utils/format'
import { KpiGrid } from '../dashboard/KpiGrid'
import { Gantt } from '../schedule/Gantt'
import { Metric } from '../layout/Panel'
import { ComparePanel, StrategyPage } from '../disruptions/DisruptionPanel'
import { DecisionCard } from '../dashboard/DecisionCard'
import { HealthPanel } from '../dashboard/HealthPanel'
import { AlertTriangle, ArrowRight, BarChart3, Factory, IndianRupee, PhoneCall, Play } from 'lucide-react'

interface DefenseModeProps {
  step: number
  plan: Plan
  impact: Impact | null
  strategies: StrategyResult[]
  onNext: () => void
  onImpact: () => void
  onReplan: () => void
  onStrategies: () => void
}

export function DefenseMode(props: DefenseModeProps) {
  const stepName = defenseSteps[props.step]
  return (
    <section className="defense-mode">
      <div className="defense-rail">
        {defenseSteps.map((step, index) => (
          <span className={index === props.step ? 'active' : index < props.step ? 'done' : ''} key={step}>{index + 1}. {step}</span>
        ))}
      </div>
      <div className="defense-stage">
        <p className="eyebrow">Defense Mode</p>
        <h2>{stepName}</h2>
        <DefenseContent step={props.step} plan={props.plan} impact={props.impact} strategies={props.strategies} />
        <div className="action-row">
          {props.step === 3 && <button className="secondary" onClick={props.onStrategies}><BarChart3 size={16} /> Run strategies</button>}
          {props.step === 4 && <button className="secondary" onClick={props.onImpact}><AlertTriangle size={16} /> Inject breakdown</button>}
          {props.step === 6 && <button className="secondary" onClick={props.onReplan}><Play size={16} /> Replan</button>}
          <button className="primary" onClick={props.onNext}>Next <ArrowRight size={16} /></button>
        </div>
      </div>
    </section>
  )
}

function DefenseContent({ step, plan, impact, strategies }: { step: number; plan: Plan; impact: Impact | null; strategies: StrategyResult[] }) {
  if (step === 0) return <KpiGrid plan={plan} />
  if (step === 1) return <Gantt plan={plan} />
  if (step === 2) return <div className="large-fact"><Factory size={26} /> {plan.kpis.bottleneck} is the calculated bottleneck; grinding utilization is {plan.kpis.grinding_utilization}%.</div>
  if (step === 3) return <StrategyPage strategies={strategies} recommendation="" loading="" onRun={() => undefined} />
  if (step === 4) return <div className="large-fact"><AlertTriangle size={26} /> Tuesday 11:00: grinding machine unavailable and one grinding operator absent.</div>
  if (step === 5) return impact ? <div className="impact-grid defense-impact"><Metric label="Affected orders" value={impact.affected_orders} /><Metric label="Late minutes" value={impact.expected_late_minutes} /><Metric label="Penalty exposure" value={money(impact.expected_penalties)} /><Metric label="Bottleneck" value={impact.bottleneck_impact} /></div> : <div className="empty-state">Run Inject breakdown to calculate impact.</div>
  if (step === 6) return <HealthPanel plan={plan} onValidate={() => undefined} />
  if (step === 7) return <ComparePanel baseline={null} plan={plan} />
  if (step === 8) return <div className="large-fact"><IndianRupee size={26} /> Replan cost delta: {money(plan.changes.total_cost_difference)}. Do-nothing penalty exposure: {money(impact?.expected_penalties ?? 0)}.</div>
  if (step === 9) return <DecisionCard plan={plan} impact={impact} />
  return <div className="large-fact"><PhoneCall size={26} /> {plan.recommendation.phone_call_recommendation.reason}</div>
}
