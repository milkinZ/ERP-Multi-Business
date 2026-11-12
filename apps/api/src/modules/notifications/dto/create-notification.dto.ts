import { IsString, IsOptional, IsInt, IsEnum, Max, Min } from 'class-validator';
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
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
