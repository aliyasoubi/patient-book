import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImplantCase } from './implant-case.entity';
import { ImplantsController } from './implants.controller';

import { ImplantRegistryService } from './implant-registry.service';

@Module({
  imports: [TypeOrmModule.forFeature([ImplantCase])],
  providers: [ImplantRegistryService],
  controllers: [ImplantsController],
})
export class ImplantsModule {}
