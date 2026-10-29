import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class UserRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds!: string[];
}
