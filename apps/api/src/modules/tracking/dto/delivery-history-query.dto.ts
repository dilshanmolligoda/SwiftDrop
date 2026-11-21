import { BadRequestException } from '@nestjs/common';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  validateSync,
} from 'class-validator';

export type DeliveryHistoryFilter = 'all' | 'active' | 'history';

function queryInteger(value: unknown): unknown {
  // Reject booleans, blanks, arrays, exponent syntax, and unsafe integers.
  return typeof value === 'string' && /^[1-9]\d*$/.test(value)
    ? Number(value)
    : value;
}

export class DeliveryHistoryQueryDto {
  @IsIn(['all', 'active', 'history'])
  filter: DeliveryHistoryFilter = 'all';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(64)
  search: string = '';

  @Transform(({ value }: { value: unknown }) => queryInteger(value))
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page: number = 1;

  @Transform(({ value }: { value: unknown }) => queryInteger(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 5;
}

/** Services validate too, so non-HTTP callers cannot bypass query constraints. */
export function parseDeliveryHistoryQuery(
  value: unknown,
): DeliveryHistoryQueryDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Invalid delivery history query');
  }
  const query = plainToInstance(DeliveryHistoryQueryDto, value);
  if (
    validateSync(query, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }).length
  ) {
    throw new BadRequestException('Invalid delivery history query');
  }
  return query;
}
