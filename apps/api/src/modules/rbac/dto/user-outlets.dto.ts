import { IsArray, IsString } from 'class-validator';

export class UserOutletsDto {
  @IsArray()
  @IsString({ each: true })
  outletIds!: string[];
}
