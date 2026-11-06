import { Injectable } from '@nestjs/common';
import {
  UsersRepository,
  type CreateCustomerData,
  type CreateMerchantData,
  type CreateCourierData,
} from './repositories/users.repository.js';
import type {
  User,
  MerchantProfile,
  CourierProfile,
} from '../../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findByEmail(email: string): Promise<User | null> {
    if (!email) {
      return null;
    }
    return this.usersRepository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    if (!id) {
      return null;
    }
    return this.usersRepository.findById(id);
  }

  async createCustomer(data: CreateCustomerData): Promise<User> {
    return this.usersRepository.createCustomer(data);
  }

  async createMerchant(
    data: CreateMerchantData,
  ): Promise<User & { merchantProfile: MerchantProfile }> {
    return this.usersRepository.createMerchant(data);
  }

  async createCourier(
    data: CreateCourierData,
  ): Promise<User & { courierProfile: CourierProfile }> {
    return this.usersRepository.createCourier(data);
  }
}
