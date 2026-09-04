import { useEffect, useMemo, useState } from 'react'
import type { Impact, Operation, Plan, StrategyResult, Validation } from '../types'
import { api } from '../services/api'
import type { PresetId } from '../data/constants'
import { emptyPlan, presets, translations } from '../data/constants'
import type { LangKey } from '../data/constants'

export type ViewId = 'control' | 'strategies' | 'defense' | 'supervisor' | 'guide'

export interface ConcurrencyConflict {
  current_version: string
  updated_ago_seconds: number
}

export function useScheduler() {
  const [plan, setPlan] = useState<Plan>(emptyPlan)
  const [baseline, setBaseline] = useState<Plan | null>(null)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [strategies, setStrategies] = useState<StrategyResult[]>([])
  const [strategyRecommendation, setStrategyRecommendation] = useState('')
  const [view, setView] = useState<ViewId>('control')
  const [preset, setPreset] = useState<PresetId>('combined_grinding_breakdown_operator_absence')
  const [custom, setCustom] = useState({ start_minute: 300, downtime_minutes: 480, machine_id: 'GRIND-G02', operator_id: 'OP-GRIND-2' })
  const [loading, setLoading] = useState('')
  const [defenseStep, setDefenseStep] = useState(0)
  const [error, setError] = useState('')

  // Pinning / overrides state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [orderExplanation, setOrderExplanation] = useState<string[] | null>(null)
  const [pinningOp, setPinningOp] = useState<Operation | null>(null)
  const [pinType, setPinType] = useState<'first' | 'machine' | 'operator' | ''>('')
  const [pinValue, setPinValue] = useState('')
  const [pinReason, setPinReason] = useState('Critical customer escalation')
  const [concurrencyConflict, setConcurrencyConflict] = useState<ConcurrencyConflict | null>(null)

  // Supervisor tablet states
  const [supervisorLang, setSupervisorLang] = useState<LangKey>('en')
  const [supervisorTab, setSupervisorTab] = useState<'jobs' | 'alerts' | 'shift'>('jobs')
  const [networkStatus, setNetworkStatus] = useState<'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNCED'>('ONLINE')
  const [offlineQueue, setOfflineQueue] = useState<Array<{ endpoint: string; payload: any }>>([])

  const disruptionPayload = useMemo(() => ({ preset, ...custom }), [preset, custom])

  useEffect(() => {
    const saved = localStorage.getItem('spw_offline_queue')
    if (saved) {
      setOfflineQueue(JSON.parse(saved))
      setNetworkStatus('OFFLINE')
    }

    api<Plan>('/api/dashboard')
      .then((data) => {
        setPlan(data)
        setBaseline(data)
      })
      .catch(() => setError('Start the backend with: cd backend; ..\\.venv\\Scripts\\uvicorn.exe app.main:app --reload'))
  }, [])

  const resetDemo = async () => {
    setLoading('Resetting deterministic demo')
    try {
      const data = await api<Plan>('/api/demo/reset', {})
      setPlan(data)
      setBaseline(data)
      setImpact(null)
      setStrategies([])
      setDefenseStep(0)
      setConcurrencyConflict(null)
      setOrderExplanation(null)
    } catch (err: any) {
      setError('Reset failed: ' + err.message)
    } finally {
      setLoading('')
    }
  }

  const analyzeImpact = async (customPayload?: any) => {
    setLoading('Calculating do-nothing impact')
    const data = await api<{ impact: Impact }>('/api/disruptions/impact', customPayload ?? disruptionPayload)
    setImpact(data.impact)
    setLoading('')
  }

  const runReplan = async (strategy = 'cheapest', customPayload?: any) => {
    setLoading('Solving with OR-Tools CP-SAT')
    try {
      const payload = customPayload ?? { ...disruptionPayload, strategy }
      const data = await api<Plan>('/api/replan', {
        ...payload,
        schedule_version: plan.schedule_version,
      })
      setPlan(data)
      setImpact(data.impact ?? impact)
    } catch (err: any) {
      if (err.status === 409) {
        setConcurrencyConflict(err.detail)
      } else {
        setError('Replan failed')
      }
    } finally {
      setLoading('')
    }
  }

  const handleApplyOverride = async () => {
    if (!pinningOp || !pinType) return
    setLoading('Applying manual override and replanning')
    try {
      const data = await api<Plan>('/api/manual-overrides', {
        order_id: pinningOp.order_id,
        operation_id: pinningOp.operation_id,
        pin_type: pinType,
        pin_value: pinValue,
        reason: pinReason,
        schedule_version: plan.schedule_version,
      })
      setPlan(data)
      setPinningOp(null)
      setPinType('')
      setPinValue('')
    } catch (err: any) {
      if (err.status === 409) {
        setConcurrencyConflict(err.detail)
      } else {
        setError('Manual override solver run failed')
      }
    } finally {
      setLoading('')
    }
  }

  const handleFetchExplanation = async (orderId: string) => {
    setSelectedOrderId(orderId)
    setLoading('Fetching scheduling explanation')
    try {
      const data = await api<{ explanation: string[] }>(`/api/orders/${orderId}/explanation`)
      setOrderExplanation(data.explanation)
    } catch (_err) {
      setError('Failed to fetch explanation')
    } finally {
      setLoading('')
    }
  }

  const validateSchedule = async () => {
    setLoading('Running backend validator')
    const validation = await api<Validation>('/api/validate', {})
    setPlan((current) => ({ ...current, validation, validated: validation.valid }))
    setLoading('')
  }

  const compareStrategies = async () => {
    setView('strategies')
    setLoading('Solving three strategy variants')
    const data = await api<{ summary: StrategyResult[]; recommendation: string }>('/api/strategies', disruptionPayload)
    setStrategies(data.summary)
    setStrategyRecommendation(data.recommendation)
    setLoading('')
  }

  const nextDefense = async () => {
    if (defenseStep === 3 && strategies.length === 0) await compareStrategies()
    if (defenseStep === 4 && !impact) await analyzeImpact()
    if (defenseStep === 6 && plan.plan_version === baseline?.plan_version) await runReplan()
    setView('defense')
    setDefenseStep((step) => Math.min(step + 1, 10))
  }

  const reportSupervisorDisruption = async (type: string, detail: any) => {
    const endpoint = `/api/disruptions/${type}`
    const payload = {
      preset: type === 'machine-breakdown' ? 'grinding_down_8' : (type === 'operator-absence' ? 'grinding_operator_absent' : 'material_delayed_12'),
      schedule_version: plan.schedule_version,
      ...detail,
    }

    if (networkStatus === 'OFFLINE') {
      const newQueue = [...offlineQueue, { endpoint, payload }]
      setOfflineQueue(newQueue)
      localStorage.setItem('spw_offline_queue', JSON.stringify(newQueue))
    } else {
      setLoading('Reporting to backend')
      try {
        const data = await api<Plan>(endpoint, payload)
        setPlan(data)
      } catch (err: any) {
        if (err.status === 409) {
          setConcurrencyConflict(err.detail)
        } else {
          setError('Failed to submit report. Switched to offline queue.')
          setNetworkStatus('OFFLINE')
          const newQueue = [...offlineQueue, { endpoint, payload }]
          setOfflineQueue(newQueue)
          localStorage.setItem('spw_offline_queue', JSON.stringify(newQueue))
        }
      } finally {
        setLoading('')
      }
    }
  }

  const syncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return
    setNetworkStatus('SYNCING')
    setLoading('Syncing supervisor actions...')
    try {
      for (const action of offlineQueue) {
        await api(action.endpoint, action.payload)
      }
      const data = await api<Plan>('/api/dashboard')
      setPlan(data)
      setBaseline(data)
      setOfflineQueue([])
      localStorage.removeItem('spw_offline_queue')
      setNetworkStatus('SYNCED')
      setTimeout(() => setNetworkStatus('ONLINE'), 2000)
    } catch (_err) {
      setError('Sync failed. Switched to offline mode.')
      setNetworkStatus('OFFLINE')
    } finally {
      setLoading('')
    }
  }

  const toggleNetwork = () => {
    if (networkStatus === 'ONLINE' || networkStatus === 'SYNCED') {
      setNetworkStatus('OFFLINE')
    } else {
      syncOfflineQueue()
    }
  }

  const refreshPlan = () => {
    api<Plan>('/api/dashboard').then((data) => {
      setPlan(data)
      setBaseline(data)
      setConcurrencyConflict(null)
    })
  }

  const activePlan = plan.operations.length ? plan : emptyPlan
  const topOrders = activePlan.orders.slice(0, 7)
  const nextDispatch = activePlan.operations.slice(0, 12)
  const selectedPresetLabel = presets.find(([id]) => id === preset)?.[1] ?? 'Custom disruption'
  const t = translations[supervisorLang]

  return {
    // State
    plan, activePlan, baseline, impact, strategies, strategyRecommendation,
    view, preset, custom, loading, defenseStep, error,
    selectedOrderId, orderExplanation, pinningOp, pinType, pinValue, pinReason,
    concurrencyConflict,
    supervisorLang, supervisorTab, networkStatus, offlineQueue,
    topOrders, nextDispatch, selectedPresetLabel, t,
    disruptionPayload,

    // Setters
    setView, setPreset, setCustom, setError,
    setPinningOp, setPinType, setPinValue, setPinReason,
    setOrderExplanation, setConcurrencyConflict,
    setSupervisorLang, setSupervisorTab,

    // Actions
    resetDemo, analyzeImpact, runReplan, handleApplyOverride,
    handleFetchExplanation, validateSchedule, compareStrategies,
    nextDefense, reportSupervisorDisruption, toggleNetwork, refreshPlan,
  }
}
