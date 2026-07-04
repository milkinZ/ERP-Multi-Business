import { IsBooleanString, IsString } from 'class-validator';

export class UploadSingleBodyDto {
  @IsString()
  category!: string;

  @IsBooleanString()
  permanent!: string;
}

export class UploadMultipleBodyDto {
  @IsString()
  category!: string;

  @IsBooleanString()
  permanent!: string;
}
