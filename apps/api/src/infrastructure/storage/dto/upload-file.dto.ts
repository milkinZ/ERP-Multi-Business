import { IsOptional, IsString, IsBooleanString } from 'class-validator';

export class UploadFileDto {
  @IsString()
  category!: string;

  @IsBooleanString()
  permanent!: string;

  @IsOptional()
  @IsString()
  folder?: string;
}
