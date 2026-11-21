import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PricingService } from './pricing.service.js';
import { EstimateFeeDto } from './dto/estimate-fee.dto.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('estimate')
  @Public()
  @HttpCode(HttpStatus.OK)
  estimateFee(@Body() dto: EstimateFeeDto) {
    return this.pricingService.estimate(dto);
  }
}
