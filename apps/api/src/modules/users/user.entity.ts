import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../domain';

/**
 * bcrypt cost for every stored password. Everything that hashes one — user
 * creation, resets, self-service change, the seed — and the auth service's
 * unknown-user dummy hash must all use this, or login timing diverges.
 */
export const BCRYPT_COST = 12;

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  username!: string;

  /** bcrypt hash — never selected unless a query asks for it explicitly. */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.Receptionist })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** Seeded accounts cannot access patient data until this is cleared. */
  @Column({ type: 'boolean', default: false })
  mustChangePassword!: boolean;

  /**
   * Bumped whenever the password changes or the account is disabled. Refresh
   * tokens carry the value they were minted with, so incrementing it revokes
   * every outstanding session for this user at once.
   */
  @Column({ type: 'int', default: 0 })
  tokenVersion!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
