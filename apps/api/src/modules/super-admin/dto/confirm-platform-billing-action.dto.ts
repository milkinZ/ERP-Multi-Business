import { Equals, IsBoolean } from 'class-validator';

export class ConfirmPlatformBillingActionDto {
  @IsBoolean()
  @Equals(true)
  confirm!: true;
}
