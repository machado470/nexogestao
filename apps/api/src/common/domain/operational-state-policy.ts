import type {
  OperationalStateValue,
} from '@prisma/client'

export const OPERATIONAL_RISK_THRESHOLDS = {
  warning: 50,
  restricted: 70,
  suspended: 90,
} as const

export function deriveOperationalStateFromRiskScore(
  riskScore: number,
): OperationalStateValue {
  if (
    riskScore
    >= OPERATIONAL_RISK_THRESHOLDS.suspended
  ) {
    return 'SUSPENDED'
  }

  if (
    riskScore
    >= OPERATIONAL_RISK_THRESHOLDS.restricted
  ) {
    return 'RESTRICTED'
  }

  if (
    riskScore
    >= OPERATIONAL_RISK_THRESHOLDS.warning
  ) {
    return 'WARNING'
  }

  return 'NORMAL'
}
