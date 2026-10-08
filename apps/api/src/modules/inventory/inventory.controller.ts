import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { InventoryService } from './inventory.service';
import {
  CreateInventoryItemDto,
  InventoryCountDto,
  InventoryMovementDto,
  QueryInventoryDto,
  UpdateInventoryItemDto,
  UpdateInventoryLotDto,
} from './dto/inventory.dto';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { UserRole } from '../../domain';

/**
 * Every role but the read-only viewer keeps the stock: whoever opens the
 * delivery or takes the last implant of a size records it, nothing finer.
 */
const STAFF = [UserRole.Admin, UserRole.Dentist, UserRole.Receptionist];

@ApiTags('inventory')
@Controller('inventory/items')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Items on the shelves, in shelf order' })
  list(@Query() query: QueryInventoryDto) {
    return this.inventory.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One item and its stock card, newest first' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.findOne(id);
  }

  @Post()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Add an item, with what is on the shelf now' })
  create(
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventory.create(dto, userId);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @ApiOperation({
    summary: 'Correct an item; its quantity moves only by a movement',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventory.update(id, dto, userId);
  }

  @Post('count')
  @HttpCode(200)
  @Roles(...STAFF)
  @ApiOperation({
    summary: 'A shelf counted at once: counts and reorder levels, saved whole',
  })
  count(@Body() dto: InventoryCountDto, @CurrentUser('id') userId: string) {
    return this.inventory.count(dto, userId);
  }

  @Patch(':id/lots/:lotId')
  @Roles(...STAFF)
  @ApiOperation({ summary: "Correct a batch's lot number or expiry" })
  updateLot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Body() dto: UpdateInventoryLotDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventory.updateLot(id, lotId, dto, userId);
  }

  @Post(':id/movements')
  @HttpCode(200)
  @Roles(...STAFF)
  @ApiOperation({
    summary:
      'Record a delivery, a use (to a patient, from a batch), a discard or a count',
  })
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InventoryMovementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventory.move(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Archive an item no longer stocked' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventory.archive(id, userId);
  }

  @Post(':id/restore')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Restore an archived item' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventory.restore(id, userId);
  }
}
