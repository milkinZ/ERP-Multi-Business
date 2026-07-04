export class Money {
  constructor(private readonly amount: number) {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('Money amount must be a non-negative integer');
    }
  }

  static fromInteger(amount: number): Money {
    return new Money(amount);
  }

  get value(): number {
    return this.amount;
  }

  toNumber(): number {
    return this.amount;
  }

  add(other: Money): Money {
    return new Money(this.amount + other.value);
  }

  multiply(factor: number): Money {
    if (!Number.isInteger(factor) || factor < 0) {
      throw new Error('Money can only be multiplied by a non-negative integer');
    }

    return new Money(this.amount * factor);
  }
}
