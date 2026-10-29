import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateTenantDto } from './update-tenant.dto';

describe('UpdateTenantDto', () => {
  it('normalizes a valid ISO 4217 currency code', () => {
    const dto = plainToInstance(UpdateTenantDto, { currencyCode: ' idr ' });

    expect(dto.currencyCode).toBe('IDR');
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects values that are not ISO 4217 currency codes', () => {
    const dto = plainToInstance(UpdateTenantDto, {
      currencyCode: 'EURO',
    });

    expect(validateSync(dto)).not.toHaveLength(0);
  });
});
