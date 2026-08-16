export type PolicyDocument = {
  apiKeyId?: string;
  monthlyBudget?: number;
  models?: string[];
  spendThisPeriodUSD?: number;
};

export class SerialQueue {
  private readonly updates = new Map<string, Promise<void>>();

  run(subject: string, update: () => Promise<void>): Promise<void> {
    const next = (this.updates.get(subject) ?? Promise.resolve()).then(update, update);
    let owner: Promise<void>;
    const release = () => {
      if (this.updates.get(subject) === owner) this.updates.delete(subject);
    };
    owner = next.then(release, release);
    this.updates.set(subject, owner);
    return next;
  }
}
