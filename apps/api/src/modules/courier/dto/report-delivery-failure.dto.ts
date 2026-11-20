import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DeliveryFailureReason } from '../../../generated/prisma/enums.js';

export class ReportDeliveryFailureDto {
  @IsEnum(DeliveryFailureReason)
  failureReason!: DeliveryFailureReason;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  note?: string;
}
