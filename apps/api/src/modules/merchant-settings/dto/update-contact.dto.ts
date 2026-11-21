import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMerchantContactDto {
  @IsString()
  @MaxLength(120)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string;

  @IsEmail()
  @MaxLength(254)
  email: string;
}
