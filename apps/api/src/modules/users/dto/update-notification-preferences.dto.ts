import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  deliveryStatusNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  failedDeliveryNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  storeConnectionNotifications?: boolean;
}
