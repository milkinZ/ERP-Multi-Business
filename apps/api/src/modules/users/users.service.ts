import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../core/database/prisma.service'

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    findByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: { email },
        })
    }

    create(data: {
        email: string
        password: string
        tenantId: string
        roleId: string
    }) {
        return this.prisma.user.create({
            data,
        })
    }
}