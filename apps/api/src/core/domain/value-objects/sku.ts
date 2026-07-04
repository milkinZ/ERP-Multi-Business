export class SKU {
  constructor(private readonly value: string) {
    if (!value || !value.trim()) {
      throw new Error('SKU must be a non-empty string');
    }
  }

  static create(value: string): SKU {
    return new SKU(value.trim());
  }

  get code(): string {
    return this.value;
  }
}
