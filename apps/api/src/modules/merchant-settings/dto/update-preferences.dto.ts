import { IsIn, IsString, MaxLength } from 'class-validator';

export class UpdateMerchantPreferencesDto {
  @IsIn(['English', 'Sinhala', 'Tamil'])
  language: string;

  @IsString()
  @MaxLength(64)
  timeZone: string;
}
