import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken!: string;

  // Must match CSRF_COOKIE_NAME value
  @IsString()
  csrfToken!: string;
}
