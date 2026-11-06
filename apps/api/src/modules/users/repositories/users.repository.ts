import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  User,
  MerchantProfile,
  CourierProfile,
} from '../../../generated/prisma/client.js';
import {
  Role,
  ApprovalStatus,
  type VehicleType,
} from '../../../generated/prisma/enums.js';

export interface CreateCustomerData {
  email: string;
  fullName: string;
  phoneNumber: string;
  passwordHash: string;
}

export interface CreateMerchantData {
  email: string;
  fullName: string;
  phoneNumber: string;
  passwordHash: string;
  businessName: string;
  businessAddress: string;
  businessType: string;
}

export interface CreateCourierData {
  email: string;
  fullName: string;
  phoneNumber: string;
  passwordHash: string;
  vehicleType: VehicleType;
  licensePlate?: string | null;
  licenseNumber?: string | null;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async createCustomer(data: CreateCustomerData): Promise<User> {
    const normalizedEmail = data.email.trim().toLowerCase();
    return this.prisma.user.create({
      data: {
        email: normalizedEmail,
        fullName: data.fullName.trim(),
        phoneNumber: data.phoneNumber.trim(),
        passwordHash: data.passwordHash,
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
      },
    });
  }

  async createMerchant(
    data: CreateMerchantData,
  ): Promise<User & { merchantProfile: MerchantProfile }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          fullName: data.fullName.trim(),
          phoneNumber: data.phoneNumber.trim(),
          passwordHash: data.passwordHash,
          role: Role.MERCHANT,
          approvalStatus: ApprovalStatus.PENDING,
          isActive: true,
        },
      });

      const merchantProfile = await tx.merchantProfile.create({
        data: {
          userId: user.id,
          businessName: data.businessName.trim(),
          businessAddress: data.businessAddress.trim(),
          businessType: data.businessType.trim(),
        },
      });

      return {
        ...user,
        merchantProfile,
      };
    });
  }

  async createCourier(
    data: CreateCourierData,
  ): Promise<User & { courierProfile: CourierProfile }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          fullName: data.fullName.trim(),
          phoneNumber: data.phoneNumber.trim(),
          passwordHash: data.passwordHash,
          role: Role.COURIER,
          approvalStatus: ApprovalStatus.PENDING,
          isActive: true,
        },
      });

      const courierProfile = await tx.courierProfile.create({
        data: {
          userId: user.id,
          vehicleType: data.vehicleType,
          licensePlate: data.licensePlate ? data.licensePlate.trim() : null,
          licenseNumber: data.licenseNumber ? data.licenseNumber.trim() : null,
        },
      });

      return {
        ...user,
        courierProfile,
      };
    });
  }
}
