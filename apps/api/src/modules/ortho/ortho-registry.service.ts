import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditService } from '../../application/services/audit.service';
import { RegistryService } from '../registries/registry.service';
import { OrthoCase } from './ortho-case.entity';

/**
 * The orthodontic register, as an injectable service.
 *
 * Exists so the controller can depend on an abstraction the container supplies
 * rather than constructing a generic service itself: a controller that calls
 * `new` cannot be given a test double, and silently owns its collaborators'
 * lifecycles. All behaviour comes from {@link RegistryService}; this class only
 * binds it to the orthodontic table.
 */
@Injectable()
export class OrthoRegistryService extends RegistryService<OrthoCase> {
  constructor(
    @InjectRepository(OrthoCase) repository: Repository<OrthoCase>,
    audit: AuditService,
  ) {
    super(repository, 'ortho_case', audit);
  }
}
