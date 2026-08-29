import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrthoCase } from './ortho-case.entity';
import { OrthoController } from './ortho.controller';

import { OrthoRegistryService } from './ortho-registry.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrthoCase])],
  providers: [OrthoRegistryService],
  controllers: [OrthoController],
  exports: [OrthoRegistryService],
})
export class OrthoModule {}
