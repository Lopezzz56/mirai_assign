import type { Operation, Order } from '../../types'
import { timeLabel, money } from '../../utils/format'

export function DispatchList({ operations }: { operations: Operation[] }) {
  return (
    <div className="dispatch-list">
      {operations.map((operation) => (
        <article className="dispatch" key={operation.operation_id}>
          <b>{operation.order_id}</b>
          <span>{operation.operation}</span>
          <small>{operation.machine_id} · {operation.operator} · {timeLabel(operation.start)}</small>
        </article>
      ))}
    </div>
  )
}

export function OrderRisk({ orders }: { orders: Order[] }) {
  return (
    <div className="risk-list">
      {orders.map((order) => (
        <article key={order.id}>
          <div>
            <b>{order.id}</b>
            <span>{order.customer}</span>
          </div>
          <strong className={order.late_minutes ? 'bad-text' : ''}>{order.late_minutes ? `${order.late_minutes}m late` : 'on time'}</strong>
          <small>{order.part} · due {timeLabel(order.due)} · {money(order.penalty)}</small>
        </article>
      ))}
    </div>
  )
}
