import type { Plan } from '../../types'
import { money } from '../../utils/format'

export function KpiGrid({ plan }: { plan: Plan }) {
  const cards = [
    ['Total orders', plan.kpis.orders, 'open production promises'],
    ['On-time percentage', `${plan.kpis.on_time}%`, `${plan.kpis.late_orders} late after current plan`],
    ['Overtime cost', money(plan.kpis.overtime), `${Math.round(plan.kpis.overtime_minutes / 60)} overtime hours`],
    ['Penalty exposure', money(plan.kpis.penalty), `${plan.kpis.at_risk} at-risk orders`],
    ['Machine utilization', `${plan.kpis.utilization}%`, 'scheduled load / open capacity'],
    ['Grinding utilization', `${plan.kpis.grinding_utilization}%`, 'critical cell load'],
    ['Bottleneck', plan.kpis.bottleneck, 'calculated from center utilization'],
    ['Total cost', money(plan.kpis.total_cost), 'penalty + overtime + changeovers'],
  ]
  return (
    <section className="kpi-grid">
      {cards.map(([label, value, hint]) => (
        <article className="kpi-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{hint}</small>
        </article>
      ))}
    </section>
  )
}
