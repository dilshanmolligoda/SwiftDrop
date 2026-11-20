import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Give the key a name, e.g. "Online store"' })
  @MaxLength(60, { message: 'Name must be at most 60 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name!: string;
}
