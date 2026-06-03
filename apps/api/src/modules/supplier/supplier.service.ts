import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'

import { PrismaService } from '../../core/database/prisma.service'

@Injectable()
export class SupplierService {
    constructor(
        private prisma: PrismaService,
    ) { }

    create(
        tenantId: string,
        data: {
            name: string
            phone?: string
            email?: string
            address?: string
        },
    ) {
        return this.prisma.supplier.create({
            data: {
                ...data,
                tenantId,
            },
        })
    }

    findAll(
        tenantId: string,
    ) {
        return this.prisma.supplier.findMany({
            where: {
                tenantId,
            },

            orderBy: {
                createdAt: 'desc',
            },
        })
    }

    async findOne(
        id: string,
        tenantId: string,
    ) {
        const supplier =
            await this.prisma.supplier.findFirst({
                where: {
                    id,
                    tenantId,
                },
            })

        if (!supplier) {
            throw new BadRequestException(
                'Supplier not found',
            )
        }

        return supplier
    }

    async update(
        id: string,
        tenantId: string,
        data: any,
    ) {
        const supplier =
            await this.prisma.supplier.findFirst({
                where: {
                    id,
                    tenantId,
                },
            })

        if (!supplier) {
            throw new BadRequestException(
                'Supplier not found',
            )
        }

        return this.prisma.supplier.update({
            where: {
                id,
            },

            data,
        })
    }

    async remove(
        id: string,
        tenantId: string,
    ) {
        const supplier =
            await this.prisma.supplier.findFirst({
                where: {
                    id,
                    tenantId,
                },
            })

        if (!supplier) {
            throw new BadRequestException(
                'Supplier not found',
            )
        }

        await this.prisma.supplier.delete({
            where: {
                id,
            },
        })

        return {
            success: true,
        }
    }
}