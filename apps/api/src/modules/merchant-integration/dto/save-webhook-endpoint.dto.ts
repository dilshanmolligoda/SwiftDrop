import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SaveWebhookEndpointDto {
  @IsString({ message: 'Webhook URL must be a string' })
  @IsNotEmpty({ message: 'Webhook URL is required' })
  @MaxLength(2048, { message: 'Webhook URL is too long' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  url!: string;
}
