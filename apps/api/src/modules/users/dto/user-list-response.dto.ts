import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

class UserPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data!: UserResponseDto[];

  @ApiProperty({ type: UserPaginationDto })
  pagination!: UserPaginationDto;
}
