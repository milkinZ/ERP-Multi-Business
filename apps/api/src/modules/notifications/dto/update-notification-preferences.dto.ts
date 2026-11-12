import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';

import { NotificationCategory } from '../notification.types';

class NotificationPreferenceDto {
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsBoolean()
  inApp!: boolean;

  @IsBoolean()
  email!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ArrayMaxSize(Object.keys(NotificationCategory).length)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceDto)
  preferences!: NotificationPreferenceDto[];
}
