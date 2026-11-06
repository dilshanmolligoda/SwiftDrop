import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNAPPROVED_KEY = 'allowUnapproved';
export const AllowUnapproved = () => SetMetadata(ALLOW_UNAPPROVED_KEY, true);

