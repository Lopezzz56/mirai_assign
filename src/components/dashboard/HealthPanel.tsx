import type { Plan } from '../../types'
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react'

export function HealthPanel({ plan, onValidate }: { plan: Plan; onValidate: () => void }) {
  const checks = plan.validation?.checks ?? {}
  return (
    <section className="health-panel">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">Prove it works</p>
          <h2>Scheduler health</h2>
        </div>
        <button className="icon-button" onClick={onValidate} title="Run backend validator"><ClipboardCheck size={17} /></button>
      </div>
      <dl>
        <div><dt>Solver</dt><dd>{plan.solver_health.solver}</dd></div>
        <div><dt>Status</dt><dd>{plan.solver_health.status}</dd></div>
        <div><dt>Solve time</dt><dd>{plan.solve_time.toFixed(2)} sec</dd></div>
        <div><dt>Objective</dt><dd>{plan.objective.toLocaleString('en-IN')}</dd></div>
        <div><dt>Constraints</dt><dd>{plan.solver_health.constraints}</dd></div>
        <div><dt>Variables</dt><dd>{plan.solver_health.decision_variables}</dd></div>
        <div><dt>Plan</dt><dd>{plan.plan_version}</dd></div>
      </dl>
      <div className="check-grid">
        {Object.entries(checks).map(([name, ok]) => (
          <span className={ok ? 'check good' : 'check bad'} key={name}>
            {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {name.replaceAll('_', ' ')}
          </span>
        ))}
      </div>
      <div className="progress-log">
        {plan.progress?.slice(-4).map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  )
}
