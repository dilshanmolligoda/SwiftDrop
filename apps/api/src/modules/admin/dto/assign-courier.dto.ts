import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignCourierDto {
  @IsUUID('4', { message: 'courierId must be a valid UUIDv4' })
  @IsNotEmpty({ message: 'courierId is required' })
  courierId!: string;
}
