import { IsDateString, IsString, Length } from 'class-validator';

export class CreatePeriodDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}
