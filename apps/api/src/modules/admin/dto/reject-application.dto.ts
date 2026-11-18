import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectApplicationDto {
  @IsString()
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @MinLength(5, { message: 'Rejection reason must be at least 5 characters' })
  @MaxLength(500, { message: 'Rejection reason cannot exceed 500 characters' })
  reason!: string;
}
