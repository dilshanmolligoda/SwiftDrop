import { IsNotEmpty, IsNumber, IsEnum, Min, IsString } from 'class-validator';
import { PackageSize } from '../../../generated/prisma/enums.js';

export class EstimateFeeDto {
  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string;

  @IsNumber()
  @Min(0.1)
  weightKg: number;

  @IsEnum(PackageSize)
  packageSize: PackageSize;
}
