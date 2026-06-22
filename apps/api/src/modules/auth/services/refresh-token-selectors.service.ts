import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

@Injectable()
export class RefreshTokenSelectorsService {
  createSelector() {
    // selector is deterministic-ish identifier, used only for DB lookup
    return crypto.randomBytes(16).toString('hex');
  }
}
