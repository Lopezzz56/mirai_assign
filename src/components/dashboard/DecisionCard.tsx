import type { Plan, Impact } from '../../types'
import { IndianRupee, PhoneCall } from 'lucide-react'
import { money } from '../../utils/format'

export function DecisionCard({ plan, impact }: { plan: Plan; impact: Impact | null }) {
  return (
    <section className="decision-card">
      <div className="decision-icon"><IndianRupee size={20} /></div>
      <p className="eyebrow">Decision</p>
      <h2>{plan.recommendation.recommended_schedule}</h2>
      <p>{plan.recommendation.owner_action}</p>
      <div className="decision-money">
        <span>Replan delta</span>
        <b>{money(plan.recommendation.financial_impact)}</b>
      </div>
      {impact && <div className="decision-money muted-money"><span>Do-nothing penalties avoided</span><b>{money(impact.expected_penalties - plan.kpis.penalty)}</b></div>}
      <div className="phone-box">
        <PhoneCall size={17} />
        <span>
          <b>{plan.recommendation.phone_call_recommendation.call_required ? 'Call customer' : 'No customer call required'}</b>
          {plan.recommendation.phone_call_recommendation.reason}
        </span>
      </div>
    </section>
  )
}
