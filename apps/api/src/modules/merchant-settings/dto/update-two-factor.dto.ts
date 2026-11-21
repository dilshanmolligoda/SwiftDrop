import { IsBoolean } from 'class-validator';

export class UpdateTwoFactorDto {
  @IsBoolean()
  enabled: boolean;
}
