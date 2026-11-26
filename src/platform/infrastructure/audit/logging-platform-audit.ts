// ===== BITÁCORA DEL DUEÑO (LOG) =====
// The manual actions of the owner of the system leave a trace in the log of
// the system (spec 25): the business, the old plan and the new one.

import { Injectable, Logger } from '@nestjs/common';
import {
  PlatformAudit,
  PlatformAuditEntry,
} from '../../application/ports/platform-audit.port';

@Injectable()
export class LoggingPlatformAudit implements PlatformAudit {
  private readonly logger = new Logger('PlatformAudit');

  record(entry: PlatformAuditEntry): Promise<void> {
    this.logger.log(this.message(entry));
    return Promise.resolve();
  }

  /** The line of the log: it names the business and what changed. */
  private message(entry: PlatformAuditEntry): string {
    switch (entry.action) {
      case 'suspend':
        return `Negocio ${entry.businessId} suspendido por el dueño del sistema.`;
      case 'reactivate':
        return `Negocio ${entry.businessId} reactivado por el dueño del sistema.${
          entry.detail ? ` ${entry.detail}.` : ''
        }`;
      case 'extend-trial':
        return `Prueba del negocio ${entry.businessId} extendida: ${entry.detail}.`;
      case 'change-plan':
        return `Cambio manual de plan del negocio ${entry.businessId}: de ${
          entry.from ?? 'ninguno'
        } a ${entry.to ?? 'ninguno'}.`;
    }
  }
}
