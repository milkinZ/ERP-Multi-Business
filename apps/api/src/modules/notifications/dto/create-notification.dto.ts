import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '../notification.types';

export class CreateNotificationDto {
  @IsEnum(NotificationType)
  type!: NotificationType;

  // @IsArray()
  // @IsEnum(NotificationChannel, { each: true })
  // channels: NotificationChannel[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  data?: Record<string, any>;
}

export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;
}
