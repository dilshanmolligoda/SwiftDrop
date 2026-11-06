import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterMerchantDto {
  @IsNotEmpty({ message: 'Applicant full name is required' })
  @IsString({ message: 'Applicant full name must be a string' })
  @MinLength(2, {
    message: 'Applicant full name must be at least 2 characters long',
  })
  fullName!: string;

  @IsNotEmpty({ message: 'Business contact email is required' })
  @IsEmail({}, { message: 'Please provide a valid business email address' })
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

  @IsNotEmpty({ message: 'Business name is required' })
  @IsString({ message: 'Business name must be a string' })
  @MinLength(2, { message: 'Business name must be at least 2 characters long' })
  businessName!: string;

  @IsNotEmpty({ message: 'Business address is required' })
  @IsString({ message: 'Business address must be a string' })
  @MinLength(5, {
    message: 'Business address must be at least 5 characters long',
  })
  businessAddress!: string;

  @IsNotEmpty({ message: 'Business type or category is required' })
  @IsString({ message: 'Business type must be a string' })
  businessType!: string;
}
