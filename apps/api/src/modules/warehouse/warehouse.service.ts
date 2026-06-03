import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'

import { PrismaService } from '../../core/database/prisma.service'

@Injectable()
export class WarehouseService {
    constructor(
        private prisma: PrismaService,
    ) { }

    async create(
        tenantId: string,
        data: {
            name: string
            outletId?: string
        },
    ) {
        if (data.outletId) {
            const outlet =
                await this.prisma.outlet.findFirst({
                    where: {
                        id: data.outletId,
                        tenantId,
                    },
                })

            if (!outlet) {
                throw new BadRequestException(
                    'Outlet not found',
                )
            }
        }

        return this.prisma.warehouse.create({
            data: {
                code: `WH-${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`,
                name: data.name,
                tenantId,
                outletId: data.outletId,
            },
        })
    }

    findAll(tenantId: string) {
        return this.prisma.warehouse.findMany({
            where: {
                tenantId,
            },

            include: {
                outlet: true,
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
        const warehouse =
            await this.prisma.warehouse.findFirst({
                where: {
                    id,
                    tenantId,
                },

                include: {
                    outlet: true,
                },
            })

        if (!warehouse) {
            throw new BadRequestException(
                'Warehouse not found',
            )
        }

        return warehouse
    }
}