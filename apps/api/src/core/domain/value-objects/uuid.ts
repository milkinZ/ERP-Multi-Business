export class UUID {
  constructor(private readonly value: string) {
    if (!value || !value.trim()) {
      throw new Error('UUID must be a non-empty string');
    }
  }

  static create(value: string): UUID {
    return new UUID(value.trim());
  }

  get id(): string {
    return this.value;
  }
}
