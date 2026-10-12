import { IsString } from 'class-validator';

export class RefreshDto {
  // Must match CSRF_COOKIE_NAME value
  @IsString()
  csrfToken!: string;
}
