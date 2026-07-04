export type UserProps = {
  id: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
};

import { User } from '@prisma/client';

export class UserAggregate {
  constructor(private props: UserProps) {}

  static create(props: UserProps) {
    if (!props.email || !props.email.trim()) {
      throw new Error('Email is required');
    }

    return new UserAggregate(props);
  }

  static fromPersistence(payload: User) {
    return new UserAggregate({
      id: payload.id,
      email: payload.email,
      passwordHash: payload.password,
      tenantId: payload.tenantId,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    });
  }

  get id() {
    return this.props.id;
  }

  get email() {
    return this.props.email;
  }

  get passwordHash() {
    return this.props.passwordHash;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  get persisted() {
    return this.props;
  }
}
