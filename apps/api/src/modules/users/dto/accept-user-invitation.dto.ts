import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class AcceptUserInvitationDto {
  @IsString()
  @Length(43, 43)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}
