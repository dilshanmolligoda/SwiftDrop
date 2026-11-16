import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  DeliveryFailureReason,
  ParcelStatus,
} from '../../../generated/prisma/enums.js';

export class UpdateDeliveryStatusDto {
  @IsEnum(ParcelStatus)
  status!: ParcelStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsEnum(DeliveryFailureReason)
  failureReason?: DeliveryFailureReason;

  @IsOptional()
  @IsUUID()
  proofId?: string;
}
