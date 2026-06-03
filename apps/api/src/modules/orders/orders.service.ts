import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'

import { PrismaService } from '../../core/database/prisma.service'
import { OrderStatus } from '@prisma/client'
import { JwtUser } from '../../common/interfaces/jwt-user.interface'
import { buildOutletFilter } from '../../common/filter/outlet-filter'

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
    ) { }

    async create(
        tenantId: string,
        outletId: string | null,
        items: {
            productId: string
            quantity: number
        }[],
    ) {
        return this.prisma.$transaction(
            async (tx) => {
                // ambil semua product
                const productIds = items.map(
                    (item) => item.productId,
                )

                const products =
                    await tx.product.findMany({
                        where: {
                            id: {
                                in: productIds,
                            },
                            tenantId,
                        },
                    })
                // validasi product
                if (
                    products.length !== items.length
                ) {
                    throw new BadRequestException(
                        'Some products not found',
                    )
                }

                // hitung total
                let totalAmount = 0

                const orderItemsData = items.map(
                    (item) => {
                        const product = products.find(
                            (p) =>
                                p.id === item.productId,
                        )

                        if (!product) {
                            throw new BadRequestException(
                                'Product not found',
                            )
                        }

                        const subtotal =
                            product.price *
                            item.quantity

                        totalAmount += subtotal

                        return {
                            productId: product.id,
                            quantity: item.quantity,
                            price: product.price,
                            subtotal,
                        }
                    },
                )

                // create order
                const order =
                    await tx.customerOrder.create({
                        data: {
                            orderNumber: `ORD-${Date.now()}`,
                            tenantId,
                            outletId,
                            totalAmount,
                        },
                    })
                // create order items
                await tx.customerOrderItem.createMany({
                    data: orderItemsData.map(
                        (item) => ({
                            ...item,
                            orderId: order.id,
                        }),
                    ),
                })

                // return full order
                return tx.customerOrder.findUnique({
                    where: {
                        id: order.id,
                    },

                    include: {
                        items: {
                            include: {
                                product: true,
                            },
                        },
                    },
                })
            },
        )
    }

    findAll(user: JwtUser) {
        return this.prisma.customerOrder.findMany({
            where: {
                tenantId: user.tenantId,
                ...buildOutletFilter(user),
            },

            include: {
                items: true,
            },

            orderBy: {
                createdAt: 'desc',
            },
        })
    }

    findOne(
        id: string,
        user: JwtUser,
    ) {
        return this.prisma.customerOrder.findFirst({
            where: {
                id,
                tenantId: user.tenantId,
                ...buildOutletFilter(user),
            },

            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        })
    }

    async updateStatus(
        id: string,
        user: JwtUser,
        status: OrderStatus,
    ) {
        return this.prisma.$transaction(
            async (tx) => {
                const order =
                    await tx.customerOrder.findFirst({
                        where: {
                            id,
                            tenantId: user.tenantId,
                            ...buildOutletFilter(user),
                        },

                        include: {
                            items: {
                                include: {
                                    product: true,
                                },
                            },
                        },
                    })

                if (!order) {
                    throw new BadRequestException(
                        'Order not found',
                    )
                }

                if (status === OrderStatus.PAID) {
                    throw new BadRequestException(
                        'Use payment endpoint to mark order as paid',
                    )
                }

                return tx.customerOrder.update({
                    where: {
                        id,
                    },

                    data: {
                        status,
                    },
                })
            },
        )
    }
}