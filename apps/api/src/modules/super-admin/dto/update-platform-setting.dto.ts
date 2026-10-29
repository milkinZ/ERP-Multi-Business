import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class UpdatePlatformSettingDto {
  @IsString()
  @MaxLength(500)
  value!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
