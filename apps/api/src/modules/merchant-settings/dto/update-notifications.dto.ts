import { IsBoolean } from 'class-validator';

export class UpdateMerchantNotificationsDto {
  @IsBoolean()
  deliveryStatusUpdates: boolean;

  @IsBoolean()
  failedDeliveries: boolean;

  @IsBoolean()
  storeConnectionIssues: boolean;
}
