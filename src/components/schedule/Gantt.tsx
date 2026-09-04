import type { Plan } from '../../types'
import { HORIZON } from '../../data/constants'
import { timeLabel } from '../../utils/format'
import type { Operation } from '../../types'

export function Gantt({ plan }: { plan: Plan }) {
  const machines = plan.machines.map((machine) => machine.id)
  const byMachine = new Map<string, Operation[]>()
  for (const machine of machines) byMachine.set(machine, [])
  for (const operation of plan.operations) byMachine.get(operation.machine_id)?.push(operation)
  const ticks = Array.from({ length: 8 }, (_, index) => index * 2)
  return (
    <div className="gantt">
      <div className="gantt-scale">
        <span />
        <div className="gantt-ticks">
          {ticks.map((day) => <b key={day}>D{day + 1}</b>)}
        </div>
      </div>
      {machines.map((machine) => (
        <div className="gantt-row" key={machine}>
          <div className="machine-label">{machine}</div>
          <div className="timeline">
            {(byMachine.get(machine) ?? []).map((operation) => {
              const left = Math.max(0, Math.min(100, (operation.start_minute / HORIZON) * 100))
              const width = Math.max(0.45, ((operation.end_minute - operation.start_minute) / HORIZON) * 100)
              return (
                <span
                  className={`bar ${operation.work_center.toLowerCase()}`}
                  key={operation.operation_id}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${operation.order_id} · ${operation.operation} · ${timeLabel(operation.start)} to ${timeLabel(operation.end)}`}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
