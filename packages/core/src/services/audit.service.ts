import { IAuditRepository, AuditLogInput, PrismaAuditRepository } from "../repositories/audit.repository";
export type { AuditLogInput };

export class AuditService {
  constructor(private auditRepo: IAuditRepository) {}

  /**
   * Write an immutable audit log entry.
   * Called by every service that modifies state.
   * This is append-only — entries are never updated or deleted.
   */
  async writeAuditLog(input: AuditLogInput): Promise<void> {
    try {
      await this.auditRepo.create(input);
    } catch (error) {
      // Audit logging should never break the main flow.
      // Log the error but don't throw.
      console.error("⚠️  Failed to write audit log:", error);
    }
  }
}

// Concrete implementation singleton for runtime
const prismaAuditRepo = new PrismaAuditRepository();
export const auditService = new AuditService(prismaAuditRepo);

// Backward-compatible function export mapping to the singleton
export const writeAuditLog = (input: AuditLogInput): Promise<void> =>
  auditService.writeAuditLog(input);
