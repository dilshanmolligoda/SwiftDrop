import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignCourierDto {
  @IsUUID(undefined, { message: 'courierId must be a valid UUID' })
  @IsNotEmpty({ message: 'courierId is required' })
  courierId!: string;
}
