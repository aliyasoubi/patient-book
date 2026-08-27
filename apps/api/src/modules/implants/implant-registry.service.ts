import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditService } from '../../application/services/audit.service';
import { RegistryService } from '../registries/registry.service';
import { ImplantCase } from './implant-case.entity';

/**
 * The implant register, as an injectable service.
 *
 * Exists so the controller can depend on an abstraction the container supplies
 * rather than constructing a generic service itself: a controller that calls
 * `new` cannot be given a test double, and silently owns its collaborators'
 * lifecycles. All behaviour comes from {@link RegistryService}; this class only
 * binds it to the implant table.
 */
@Injectable()
export class ImplantRegistryService extends RegistryService<ImplantCase> {
  constructor(
    @InjectRepository(ImplantCase) repository: Repository<ImplantCase>,
    audit: AuditService,
  ) {
    super(repository, 'implant_case', audit);
  }
}
