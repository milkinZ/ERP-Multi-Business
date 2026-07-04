export class OrderNumber {
  constructor(private readonly value: string) {
    if (!value || !value.trim()) {
      throw new Error('Order number must be a non-empty string');
    }
  }

  static create(value: string): OrderNumber {
    return new OrderNumber(value.trim());
  }

  get code(): string {
    return this.value;
  }
}
