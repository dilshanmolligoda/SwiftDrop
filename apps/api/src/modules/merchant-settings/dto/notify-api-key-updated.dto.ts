import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class NotifyApiKeyUpdatedDto {
  @IsNotEmpty()
  @IsIn(['issued', 'revoked'])
  action!: 'issued' | 'revoked';

  @IsNotEmpty()
  @IsString()
  keyPrefix!: string;
}
