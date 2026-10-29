import { IsString } from 'class-validator';

export class SwitchOutletDto {
  @IsString()
  outletId!: string;

  @IsString()
  csrfToken!: string;
}
