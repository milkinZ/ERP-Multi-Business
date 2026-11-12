import {
  Equals,
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAutopayEnrollmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  channelCode!: string;

  @IsBoolean()
  @Equals(true)
  consent!: true;
}
