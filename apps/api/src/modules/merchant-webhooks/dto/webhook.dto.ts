import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_WEBHOOK_URL_LENGTH } from '@swiftdrop/contracts';
import { WebhookDeliveryStatus } from '../../../generated/prisma/enums.js';

export class SaveWebhookDto {
  /** Format and network rules are checked by WebhookTargetPolicy. */
  @IsString()
  @MaxLength(MAX_WEBHOOK_URL_LENGTH)
  url!: string;
}

export class ListWebhookDeliveriesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsEnum(WebhookDeliveryStatus)
  status?: WebhookDeliveryStatus;
}
