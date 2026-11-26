import {
  databaseOf,
  planBackup,
  planRestore,
  redactUri,
  runPlan,
} from './db-backup';

const URI =
  'mongodb+srv://user:s3cret@cluster0.abc.mongodb.net/booking?retryWrites=true';
const NOW = new Date('2026-11-26T10:05:09Z');
const nothingExists = () => false;

describe('redactUri / databaseOf', () => {
  it('hides the credentials and keeps host and database', () => {
    expect(redactUri(URI)).toBe(
      'mongodb+srv://***@cluster0.abc.mongodb.net/booking?retryWrites=true',
    );
    expect(redactUri(URI)).not.toContain('s3cret');
    expect(redactUri('mongodb://localhost:27017/booking')).toBe(
      'mongodb://localhost:27017/booking',
    );
  });

  it('reads the database of the path', () => {
    expect(databaseOf(URI)).toBe('booking');
    expect(databaseOf('mongodb://localhost:27017')).toBeNull();
    expect(databaseOf('mongodb://localhost:27017/')).toBeNull();
  });
});

describe('planBackup', () => {
  it('requires MONGO_URI', () => {
    expect(
      planBackup({ uri: undefined, now: NOW, exists: nothingExists }),
    ).toEqual({
      ok: false,
      message: 'MONGO_URI is required (set it in .env or the environment).',
    });
    expect(planBackup({ uri: '  ', now: NOW, exists: nothingExists }).ok).toBe(
      false,
    );
  });

  it('requires the database in the URI', () => {
    const plan = planBackup({
      uri: 'mongodb://localhost:27017',
      now: NOW,
      exists: nothingExists,
    });
    expect(plan.ok).toBe(false);
  });

  it('builds the mongodump call into backups/<date> with an args array', () => {
    const plan = planBackup({ uri: URI, now: NOW, exists: nothingExists });

    expect(plan).toEqual({
      ok: true,
      command: 'mongodump',
      args: [`--uri=${URI}`, '--out=backups/2026-11-26_100509'],
      folder: 'backups/2026-11-26_100509',
      database: 'booking',
      target:
        'mongodb+srv://***@cluster0.abc.mongodb.net/booking?retryWrites=true',
    });
  });

  it('refuses to write into a folder that exists', () => {
    const plan = planBackup({
      uri: URI,
      now: NOW,
      out: 'backups/mine',
      exists: (path) => path === 'backups/mine',
    });
    expect(plan).toEqual({
      ok: false,
      message:
        'The folder "backups/mine" already exists: refusing to overwrite it.',
    });
  });

  it('refuses the default folder when it exists too', () => {
    const plan = planBackup({ uri: URI, now: NOW, exists: () => true });
    expect(plan.ok).toBe(false);
  });
});

describe('planRestore', () => {
  const dumpHas = (path: string) =>
    path === 'backups/x' || path === 'backups/x/booking';

  it('requires the folder', () => {
    expect(
      planRestore({ uri: URI, folder: undefined, yes: true, exists: dumpHas })
        .ok,
    ).toBe(false);
  });

  it('requires MONGO_URI', () => {
    expect(
      planRestore({
        uri: undefined,
        folder: 'backups/x',
        yes: true,
        exists: dumpHas,
      }).ok,
    ).toBe(false);
  });

  it('refuses a folder that does not exist or has no dump of that database', () => {
    const missing = planRestore({
      uri: URI,
      folder: 'backups/y',
      yes: true,
      exists: dumpHas,
    });
    expect(missing).toEqual({
      ok: false,
      message: 'The folder "backups/y" does not exist.',
    });
    const wrongDb = planRestore({
      uri: URI,
      folder: 'backups/x',
      yes: true,
      exists: (path) => path === 'backups/x',
    });
    expect(wrongDb).toEqual({
      ok: false,
      message: 'The folder "backups/x" has no dump of the database "booking".',
    });
  });

  it('asks for --yes and says which database it would replace', () => {
    const plan = planRestore({
      uri: URI,
      folder: 'backups/x',
      yes: false,
      exists: dumpHas,
    });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.message).toContain('--yes');
    expect(!plan.ok && plan.message).toContain(
      'mongodb+srv://***@cluster0.abc.mongodb.net/booking?retryWrites=true',
    );
    expect(!plan.ok && plan.message).not.toContain('s3cret');
  });

  it('builds the mongorestore call, restricted to that database', () => {
    expect(
      planRestore({
        uri: URI,
        folder: 'backups/x',
        yes: true,
        exists: dumpHas,
      }),
    ).toEqual({
      ok: true,
      command: 'mongorestore',
      args: [`--uri=${URI}`, '--drop', '--nsInclude=booking.*', 'backups/x'],
      folder: 'backups/x',
      database: 'booking',
      target:
        'mongodb+srv://***@cluster0.abc.mongodb.net/booking?retryWrites=true',
    });
  });
});

describe('runPlan', () => {
  const plan = planBackup({ uri: URI, now: NOW, exists: nothingExists });

  it('prints the target (redacted), runs the command through the spawner and answers its code', async () => {
    const lines: string[] = [];
    const spawned: { command: string; args: string[] }[] = [];
    if (!plan.ok) throw new Error('plan');

    const code = await runPlan(plan, {
      spawn: (command, args) => {
        spawned.push({ command, args });
        return Promise.resolve(0);
      },
      log: (line) => lines.push(line),
    });

    expect(code).toBe(0);
    expect(spawned).toEqual([{ command: plan.command, args: plan.args }]);
    expect(lines.join('\n')).toContain('booking');
    expect(lines.join('\n')).not.toContain('s3cret');
  });

  it('answers a failing exit code, and 1 when the tool cannot start', async () => {
    if (!plan.ok) throw new Error('plan');
    const log = () => undefined;
    expect(await runPlan(plan, { spawn: () => Promise.resolve(3), log })).toBe(
      3,
    );
    expect(
      await runPlan(plan, {
        spawn: () => Promise.reject(new Error('ENOENT')),
        log,
      }),
    ).toBe(1);
  });
});
