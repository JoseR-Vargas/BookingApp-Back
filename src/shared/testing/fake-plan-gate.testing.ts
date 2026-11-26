import {
  PlanGate,
  PlanResource,
  PlanVerdict,
} from '../application/plan-gate.port';
import { DomainError } from '../domain/domain-error';
import { Result, err, ok } from '../domain/result';

/** A plan gate that answers what the test says (a business without a plan by default). */
export class FakePlanGate implements PlanGate {
  /** The verdict for every resource unless `refuse` names it. */
  verdict: PlanVerdict = { governs: false };
  /** Resources refused, with the error to answer. */
  refuse = new Map<PlanResource, DomainError>();
  asked: PlanResource[] = [];

  check(resource: PlanResource): Promise<Result<PlanVerdict, DomainError>> {
    this.asked.push(resource);
    const refusal = this.refuse.get(resource);
    return Promise.resolve(refusal ? err(refusal) : ok(this.verdict));
  }
}
