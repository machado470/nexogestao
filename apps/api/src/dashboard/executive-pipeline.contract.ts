export const EXECUTIVE_PIPELINE_STAGE_KEYS = [
  'customers',
  'appointments',
  'service-orders',
  'charges',
  'payments',
] as const

export type ExecutivePipelineStageKey = typeof EXECUTIVE_PIPELINE_STAGE_KEYS[number]
export type ExecutivePipelineStageState =
  | 'done'
  | 'active'
  | 'warning'
  | 'blocked'
  | 'idle'
  | 'unavailable'

export interface ExecutivePipelineStage {
  key: ExecutivePipelineStageKey
  label: string
  state: ExecutivePipelineStageState
  volume: number
  reason: string
  evidence: {
    source: 'CUSTOMER' | 'APPOINTMENT' | 'SERVICE_ORDER' | 'CHARGE' | 'PAYMENT'
    description: string
  }
  referenceTimestamp: string | null
  navigationTarget: string
}

export interface ExecutivePipelineContract {
  generatedAt: string
  stages: ExecutivePipelineStage[]
}
