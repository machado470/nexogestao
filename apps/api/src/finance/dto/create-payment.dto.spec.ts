import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreatePaymentDto } from './create-payment.dto'

describe('CreatePaymentDto', () => {
  const errorsFor = (amountCents: unknown) =>
    validate(plainToInstance(CreatePaymentDto, { method: 'PIX', amountCents }))

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1000']) (
    'rejeita amountCents inválido: %p',
    async (amountCents) => {
      expect(await errorsFor(amountCents)).not.toHaveLength(0)
    },
  )

  it('aceita um valor inteiro positivo em centavos', async () => {
    expect(await errorsFor(1001)).toHaveLength(0)
  })
})
