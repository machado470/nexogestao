import {
  deriveOperationalStateFromRiskScore,
  OPERATIONAL_RISK_THRESHOLDS,
} from './operational-state-policy'

describe('operational state policy', () => {
  it('mantém os thresholds operacionais canônicos', () => {
    expect(OPERATIONAL_RISK_THRESHOLDS).toEqual({
      warning: 50,
      restricted: 70,
      suspended: 90,
    })
  })

  it.each([
    [0, 'NORMAL'],
    [49, 'NORMAL'],
    [50, 'WARNING'],
    [69, 'WARNING'],
    [70, 'RESTRICTED'],
    [89, 'RESTRICTED'],
    [90, 'SUSPENDED'],
    [100, 'SUSPENDED'],
  ] as const)(
    'deriva score %s como %s',
    (score, expectedState) => {
      expect(
        deriveOperationalStateFromRiskScore(score),
      ).toBe(expectedState)
    },
  )
})
