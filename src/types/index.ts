export interface Operation {
  operation_id: string
  order_id: string
  sequence: number
  operation: string
  part: string
  customer: string
  family: string
  quantity: number
  work_center: string
  machine_id: string
  operator_id: string
  operator: string
  start_minute: number
  end_minute: number
  start: string
  end: string
  duration: number
  setup: number
  due: string
}

export interface Order {
  id: string
  customer: string
  part: string
  quantity: number
  due: string
  completion: string
  late_minutes: number
  penalty: number
  priority: number
  family: string
}

export interface Validation {
  valid: boolean
  checks: Record<string, boolean>
  issues: string[]
}

export interface Metrics {
  orders: number
  operations: number
  on_time: number
  late_orders: number
  late_minutes: number
  overtime_minutes: number
  overtime: number
  penalty: number
  total_cost: number
  utilization: number
  grinding_utilization: number
  bottleneck: string
  at_risk: number
  changeover_hours: number
  robustness_score: number
  capacity_by_center: Record<string, number>
}

export interface MovedOperation {
  operation_id: string
  order_id: string
  part: string
  from: string
  to: string
  delta_minutes: number
  machine_from: string
  machine_to: string
  operator_from: string
  operator_to: string
}

export interface Changes {
  operations_moved: number
  machines_changed: number
  operators_changed: number
  jobs_delayed: number
  jobs_pulled_forward: number
  additional_overtime: number
  additional_changeovers: number
  penalty_difference: number
  execution_cost?: number
  total_cost_difference: number
  cost_delta: number
  moved_operations: MovedOperation[]
}

export interface PhoneCallRecommendation {
  call_required: boolean
  customer: string
  reason: string
}

export interface Recommendation {
  recommended_schedule: string
  why: string[]
  financial_impact: number
  affected_customer: string
  owner_action: string
  phone_call_recommendation: PhoneCallRecommendation
}

export interface SolverHealth {
  solver: string
  status: string
  solve_time: number
  objective: number
  constraints: number
  decision_variables: number
  operations: number
  machines: number
  orders: number
  schedule_changes: number
  baseline_objective: number
  replanned_objective: number
}

export interface ScenarioHistoryEntry {
  plan_version: string
  preset: string
  cost_delta: number
  validated: boolean
}

export interface Plan {
  plan_version: string
  schedule_version: number
  strategy: string
  solver: string
  solver_status: string
  solve_time: number
  objective: number
  feasible: boolean
  validated: boolean
  validation: Validation
  operations: Operation[]
  orders: Order[]
  machines: Array<{ id: string; name: string; center: string }>
  operators: Array<{ id: string; name: string; skills: string[] }>
  kpis: Metrics
  changes: Changes
  recommendation: Recommendation
  solver_health: SolverHealth
  progress: string[]
  impact?: Impact
  scenario_history?: ScenarioHistoryEntry[]
}

export interface Impact {
  headline: string
  affected_orders: number
  affected_order_ids: string[]
  affected_operations: number
  expected_late_orders: number
  expected_late_minutes: number
  expected_penalties: number
  expected_overtime: number
  bottleneck_impact: string
  penalty_delta: number
  overtime_delta: number
  do_nothing_total_cost: number
}

export interface StrategyResult {
  strategy: string
  total_cost: number
  penalties: number
  overtime: number
  on_time: number
  changeover_hours: number
  bottleneck_utilization: number
  robustness_score: number
  solver_status: string
  validated: boolean
}

export interface OfflineAction {
  id: string
  type: 'machine_down' | 'material_delay' | 'rework' | 'absent_operator'
  payload: any
  timestamp: string
}
