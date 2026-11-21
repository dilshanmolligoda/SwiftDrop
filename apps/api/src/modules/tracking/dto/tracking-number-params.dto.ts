import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { normalizeTrackingNumber } from '../domain/tracking-number.js';

export class TrackingNumberParamsDto {
  @Transform(({ value }: { value: unknown }) => normalizeTrackingNumber(value))
  @IsString()
  trackingNumber!: string;
}
