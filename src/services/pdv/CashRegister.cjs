/*
 * CashRegister.js
 *
 * Models a cash register for front of house operations. It
 * tracks opening and closing balances as well as cash
 * operations such as supplies and withdrawals (sangrias).
 */

class CashRegister {
  constructor(initialAmount = 0, operator = 'sistema') {
    this.opened = false;
    this.initialAmount = initialAmount;
    this.currentAmount = 0;
    this.operator = operator;
    this.operations = [];
  }

  open(initialAmount, operator = this.operator) {
    if (this.opened) {
      throw new Error('Caixa já está aberto.');
    }
    this.opened = true;
    this.initialAmount = initialAmount;
    this.currentAmount = initialAmount;
    this.operator = operator;
    this.operations.push({
      type: 'abertura',
      amount: initialAmount,
      operator,
      timestamp: new Date(),
    });
  }

  supply(amount, operator = this.operator, reason = 'suprimento') {
    if (!this.opened) {
      throw new Error('Caixa não está aberto.');
    }
    if (amount <= 0) {
      throw new Error('Valor de suprimento deve ser positivo.');
    }
    this.currentAmount += amount;
    this.operations.push({
      type: 'suprimento',
      amount,
      operator,
      reason,
      timestamp: new Date(),
    });
  }

  withdrawal(amount, operator = this.operator, reason = 'sangria') {
    if (!this.opened) {
      throw new Error('Caixa não está aberto.');
    }
    if (amount <= 0) {
      throw new Error('Valor de sangria deve ser positivo.');
    }
    if (amount > this.currentAmount) {
      throw new Error('Valor de sangria maior que o saldo em caixa.');
    }
    this.currentAmount -= amount;
    this.operations.push({
      type: 'sangria',
      amount,
      operator,
      reason,
      timestamp: new Date(),
    });
  }

  close(finalAmount = this.currentAmount, operator = this.operator) {
    if (!this.opened) {
      throw new Error('Caixa não está aberto.');
    }
    const resumo = {
      operador: operator,
      inicial: this.initialAmount,
      final: finalAmount,
      totalOperacional: this.currentAmount,
      suprimentos: this.operations
        .filter((op) => op.type === 'suprimento')
        .reduce((s, op) => s + op.amount, 0),
      sangrias: this.operations
        .filter((op) => op.type === 'sangria')
        .reduce((s, op) => s + op.amount, 0),
      operacoes: this.operations,
    };
    this.opened = false;
    this.initialAmount = 0;
    this.currentAmount = 0;
    this.operations = [];
    return resumo;
  }
}

module.exports = CashRegister;
