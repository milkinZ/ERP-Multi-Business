import { ArrayUnique, IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateSubscriptionModulesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  moduleIds!: string[];
}
