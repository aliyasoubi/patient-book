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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { TariffsService } from './tariffs.service';
import { CreateTariffDto, UpdateTariffDto } from './dto/tariff.dto';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { UserRole } from '../../domain';

/**
 * The same roles as the stock: the tariff page also sets what the items sold
 * to patients go for, and those prices are the stock's to keep.
 */
const STAFF = [UserRole.Admin, UserRole.Dentist, UserRole.Receptionist];

@ApiTags('tariffs')
@Controller('tariffs')
export class TariffsController {
  constructor(private readonly tariffs: TariffsService) {}

  @Get()
  @ApiOperation({ summary: 'The price list, in the practice’s order' })
  list() {
    return this.tariffs.list();
  }

  @Post()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Add a service to the price list' })
  create(@Body() dto: CreateTariffDto, @CurrentUser('id') userId: string) {
    return this.tariffs.create(dto, userId);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Change a service’s price, name or heading' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTariffDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tariffs.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Take a service off the price list' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tariffs.remove(id, userId);
  }
}
