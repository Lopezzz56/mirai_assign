import type { Operation, Plan } from '../../types'
import type { ConcurrencyConflict } from '../../hooks/useScheduler'
import { AlertTriangle, XCircle } from 'lucide-react'

interface ExplanationModalProps {
  selectedOrderId: string | null
  orderExplanation: string[]
  onClose: () => void
}

export function ExplanationModal({ selectedOrderId, orderExplanation, onClose }: ExplanationModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3>Order Schedule Explanation</h3>
          <button className="icon-button" style={{ minWidth: '32px', minHeight: '32px', borderRadius: '50%' }} onClick={onClose}><XCircle size={16} /></button>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <p><b>Order:</b> {selectedOrderId}</p>
          <div style={{ display: 'grid', gap: '8px', borderLeft: '4px solid #d7ef63', paddingLeft: '12px' }}>
            {orderExplanation.map((step, idx) => (
              <div key={idx} style={{ fontSize: '13px', color: '#1a2930', padding: '6px 0' }}>{step}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface PinningModalProps {
  pinningOp: Operation
  pinType: 'first' | 'machine' | 'operator' | ''
  setPinType: (value: 'first' | 'machine' | 'operator' | '') => void
  pinValue: string
  setPinValue: (value: string) => void
  pinReason: string
  setPinReason: (value: string) => void
  plan: Plan
  onApply: () => void
  onClose: () => void
}

export function PinningModal(props: PinningModalProps) {
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Pin Operations & Manual Override</h3>
        <p className="muted" style={{ marginBottom: '16px' }}>Enforce specific scheduling constraints for Order {props.pinningOp.order_id}.</p>

        <div style={{ display: 'grid', gap: '14px' }}>
          <label style={{ display: 'block' }}>
            <b>Constraint Type</b>
            <select className="preset" style={{ width: '100%', marginTop: '6px', height: '40px' }} value={props.pinType} onChange={(e: any) => props.setPinType(e.target.value)}>
              <option value="first">Pin Order FIRST in dispatch queue</option>
              <option value="machine">Pin to Machine</option>
              <option value="operator">Pin to Operator</option>
            </select>
          </label>

          {props.pinType === 'machine' && (
            <label style={{ display: 'block' }}>
              <b>Select Machine</b>
              <select className="preset" style={{ width: '100%', marginTop: '6px', height: '40px' }} value={props.pinValue} onChange={(e) => props.setPinValue(e.target.value)}>
                <option value="">Choose machine...</option>
                {props.plan.machines.map(m => (
                  <option key={m.id} value={m.id}>{m.id} - {m.name}</option>
                ))}
              </select>
            </label>
          )}

          {props.pinType === 'operator' && (
            <label style={{ display: 'block' }}>
              <b>Select Operator</b>
              <select className="preset" style={{ width: '100%', marginTop: '6px', height: '40px' }} value={props.pinValue} onChange={(e) => props.setPinValue(e.target.value)}>
                <option value="">Choose operator...</option>
                {props.plan.operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name} ({op.id})</option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: 'block' }}>
            <b>Reason for Override</b>
            <input value={props.pinReason} onChange={(e) => props.setPinReason(e.target.value)} style={{ font: '13px var(--sans)' }} />
          </label>
        </div>

        <div className="modal-actions">
          <button className="secondary" onClick={props.onClose}>Cancel</button>
          <button className="primary" onClick={props.onApply} disabled={props.pinType !== 'first' && !props.pinValue}>Enforce Pin</button>
        </div>
      </div>
    </div>
  )
}

interface ConcurrencyModalProps {
  conflict: ConcurrencyConflict
  onRefresh: () => void
}

export function ConcurrencyModal({ conflict, onRefresh }: ConcurrencyModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ borderColor: '#ead8c7', background: '#fff8ef' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#b44638' }}>
          <AlertTriangle size={24} />
          <h3 style={{ margin: 0 }}>SCHEDULE UPDATED</h3>
        </div>
        <p style={{ marginTop: '14px', fontSize: '14px', color: '#172329' }}>
          A newer plan (<b>{conflict.current_version}</b>) was generated approximately {conflict.updated_ago_seconds} seconds ago by another supervisor.
        </p>
        <p className="muted" style={{ fontSize: '13px' }}>
          Your action was blocked to prevent stale schedule overrides. Please refresh to load the latest schedule.
        </p>
        <div className="modal-actions">
          <button className="primary" onClick={onRefresh}>
            [VIEW NEW PLAN]
          </button>
        </div>
      </div>
    </div>
  )
}
