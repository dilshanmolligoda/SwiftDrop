import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import type { PublicTrackingResponse } from '../domain/parcel.types.js';
import { TrackingNumberParamsDto } from '../dto/tracking-number-params.dto.js';
import { PublicTrackingRateLimitGuard } from '../guards/public-tracking-rate-limit.guard.js';
import { PublicTrackingService } from '../services/public-tracking.service.js';

@Controller('tracking')
export class PublicTrackingController {
  constructor(private readonly tracking: PublicTrackingService) {}

  @Public()
  @UseGuards(PublicTrackingRateLimitGuard)
  @Get(':trackingNumber')
  getTracking(
    @Param() params: TrackingNumberParamsDto,
  ): Promise<PublicTrackingResponse> {
    return this.tracking.getPublicTracking(params.trackingNumber);
  }
}
