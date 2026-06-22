import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RefreshSecretHashService {
  async hashSecret(secret: string) {
    return bcrypt.hash(secret, 10);
  }

  async verifySecret(secret: string, secretHash: string) {
    return bcrypt.compare(secret, secretHash);
  }
}
