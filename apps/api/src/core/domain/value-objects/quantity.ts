export class Quantity {
  constructor(private readonly amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Quantity must be a positive integer');
    }
  }

  static create(amount: number): Quantity {
    return new Quantity(amount);
  }

  get value(): number {
    return this.amount;
  }
}
