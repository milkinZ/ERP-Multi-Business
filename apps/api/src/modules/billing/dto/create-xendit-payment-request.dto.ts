import { IsNotEmpty, IsString } from 'class-validator';

export class CreateXenditPaymentRequestDto {
  @IsString()
  @IsNotEmpty()
  channelCode!: string;
}
