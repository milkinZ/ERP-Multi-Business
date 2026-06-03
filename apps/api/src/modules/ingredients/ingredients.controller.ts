import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common'

import { IngredientsService } from './ingredients.service'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { CurrentUser } from '../../common/decorator/current-user.decorator'
import { Permissions } from '../../common/decorator/permissions.decorator'

import type { JwtUser } from '../../common/interfaces/jwt-user.interface'

import { CreateIngredientDto } from './dto/create-ingredient.dto'
import { PermissionGuard } from '../rbac/permission.guard'
import { PERMISSIONS } from '../rbac/permissions'

@UseGuards(
    JwtAuthGuard,
    PermissionGuard,
)
@Controller('ingredients')
export class IngredientsController {
    constructor(
        private ingredientsService: IngredientsService,
    ) { }

    @Post()
    @Permissions(
        PERMISSIONS.INGREDIENT_CREATE,
    )
    create(
        @Body()
        dto: CreateIngredientDto,

        @CurrentUser()
        user: JwtUser,
    ) {
        return this.ingredientsService.create(
            user.tenantId,
            dto,
        )
    }

    @Get()
    @Permissions(
        PERMISSIONS.INGREDIENT_READ,
    )
    findAll(
        @CurrentUser()
        user: JwtUser,
    ) {
        return this.ingredientsService.findAll(
            user.tenantId,
        )
    }

    @Get(':id')
    @Permissions(
        PERMISSIONS.INGREDIENT_READ,
    )
    findOne(
        @Param('id')
        id: string,

        @CurrentUser()
        user: JwtUser,
    ) {
        return this.ingredientsService.findOne(
            id,
            user.tenantId,
        )
    }
}