import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  Min,
  IsOptional,
} from 'class-validator';
import { PackageSize } from '../../../generated/prisma/enums.js';

export class CreateParcelDto {
  @IsString()
  @IsNotEmpty()
  senderAddress: string;

  @IsString()
  @IsNotEmpty()
  recipientName: string;

  @IsString()
  @IsNotEmpty()
  recipientAddress: string;

  @IsString()
  @IsNotEmpty()
  recipientPhone: string;

  @IsEnum(PackageSize)
  packageSize: PackageSize;

  @IsNumber()
  @Min(0.1)
  weightKg: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
