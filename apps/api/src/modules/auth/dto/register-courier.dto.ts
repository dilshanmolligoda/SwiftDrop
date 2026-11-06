import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { VehicleType } from '../../../generated/prisma/enums.js';

export class RegisterCourierDto {
  @IsNotEmpty({ message: 'Full name is required' })
  @IsString({ message: 'Full name must be a string' })
  @MinLength(2, { message: 'Full name must be at least 2 characters long' })
  fullName!: string;

  @IsNotEmpty({ message: 'Email address is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString({ message: 'Phone number must be a string' })
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'Phone number must be a valid number with 9 to 15 digits',
  })
  phoneNumber!: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  password!: string;

  @IsNotEmpty({ message: 'Vehicle type is required' })
  @IsEnum(VehicleType, {
    message: 'Vehicle type must be one of: BICYCLE, MOTORCYCLE, CAR, VAN',
  })
  vehicleType!: VehicleType;

  @ValidateIf((o: RegisterCourierDto) => o.vehicleType !== VehicleType.BICYCLE)
  @IsNotEmpty({
    message: 'Vehicle registration number is required for motorized vehicles',
  })
  @IsString({ message: 'Vehicle registration number must be a string' })
  licensePlate?: string;

  @ValidateIf((o: RegisterCourierDto) => o.vehicleType !== VehicleType.BICYCLE)
  @IsNotEmpty({
    message: 'Driving licence number is required for motorized vehicles',
  })
  @IsString({ message: 'Driving licence number must be a string' })
  licenseNumber?: string;
}

