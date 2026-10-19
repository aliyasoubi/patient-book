import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { AuditService } from '../../application/services/audit.service';
import { RegistryService } from '../registries/registry.service';
import { refreshCaseCopies } from '../surgery/case-copy';
import { ImplantCase } from './implant-case.entity';

/**
 * The implant register, as an injectable service.
 *
 * Exists so the controller can depend on an abstraction the container supplies
 * rather than constructing a generic service itself: a controller that calls
 * `new` cannot be given a test double, and silently owns its collaborators'
 * lifecycles. Behaviour comes from {@link RegistryService}; this class binds
 * it to the implant table, and keeps the surgery rows filed under a case in
 * step when the case is renumbered or renamed.
 */
@Injectable()
export class ImplantRegistryService extends RegistryService<ImplantCase> {
  constructor(
    @InjectRepository(ImplantCase) repository: Repository<ImplantCase>,
    audit: AuditService,
  ) {
    super(repository, 'implant_case', audit);
  }

  protected override async afterUpdate(
    manager: EntityManager,
    saved: ImplantCase,
  ): Promise<void> {
    await refreshCaseCopies(manager, [saved.id]);
  }
}
