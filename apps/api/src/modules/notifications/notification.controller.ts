import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { ListNotificationsDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Get user notifications
   */
  @Get()
  @ApiOperation({
    summary: 'Get user notifications',
    description: 'Retrieve notifications for current user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notifications retrieved successfully',
  })
  async getNotifications(
    @Query() dto: ListNotificationsDto,
    @CurrentUser() user: JwtUser,
  ) {
    const result = await this.notificationService.getUserNotifications(
      user.userId,
      user.tenantId,
      dto.page,
      dto.limit,
    );

    return {
      success: true,
      message: 'Notifications retrieved successfully',
      data: result.data,
      pagination: result.pagination,
    };
  }

  /**
   * Get unread notifications count
   */
  @Get('unread/count')
  @ApiOperation({
    summary: 'Get unread notifications count',
    description: 'Get count of unread notifications for current user',
  })
  async getUnreadCount(@CurrentUser() user: JwtUser) {
    const count = await this.notificationService.getUnreadCount(
      user.userId,
      user.tenantId,
    );

    return {
      success: true,
      message: 'Unread count retrieved',
      data: { unreadCount: count },
    };
  }

  /**
   * Mark notification as read
   */
  @Put(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Mark a specific notification as read',
  })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    const result = await this.notificationService.markAsRead(id, user.tenantId);

    if (result.count === 0) {
      throw new BadRequestException('Notification not found');
    }

    return {
      success: true,
      message: 'Notification marked as read',
      data: { updated: result.count },
    };
  }

  /**
   * Mark all notifications as read
   */
  @Put('read/all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Mark all notifications as read for current user',
  })
  async markAllAsRead(@CurrentUser() user: JwtUser) {
    const result = await this.notificationService.markAllAsRead(
      user.userId,
      user.tenantId,
    );

    return {
      success: true,
      message: 'All notifications marked as read',
      data: { updated: result.count },
    };
  }

  /**
   * Delete notification
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete notification',
    description: 'Delete a specific notification (soft delete)',
  })
  async deleteNotification(
    @Param('id') id: string,
    // @CurrentUser() user: JwtUser,
  ) {
    await this.notificationService.deleteNotification(id);

    return {
      success: true,
      message: 'Notification deleted successfully',
    };
  }
}
