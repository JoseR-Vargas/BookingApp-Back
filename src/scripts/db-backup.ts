// ===== BACKUP AND RESTORE OF THE DATABASE =====
// `npm run db:backup`                         dumps the database to backups/<date>
// `npm run db:restore -- <folder> --yes`      restores a dump (drops what it replaces)
//
// Atlas free has no automatic backups (spec 22). These commands call
// `mongodump` / `mongorestore` (MongoDB Database Tools must be installed) with
// an arguments array, never a shell string. The pure parts (plans, redaction)
// are exported and tested with an injected spawner; nothing here is run by the
// test suite against a real database.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** A command to run, or the reason it must not run. */
export type Plan =
  | {
      ok: true;
      command: 'mongodump' | 'mongorestore';
      args: string[];
      folder: string;
      database: string;
      /** The connection string without credentials, safe to print. */
      target: string;
    }
  | { ok: false; message: string };

export type OkPlan = Extract<Plan, { ok: true }>;

export interface Runner {
  /** Runs the command with the terminal attached; answers its exit code. */
  spawn(command: string, args: string[]): Promise<number>;
  log(line: string): void;
}

/** The connection string without credentials. */
export const redactUri = (uri: string): string =>
  uri.replace(/\/\/[^@/]*@/, '//***@');

/** The database named in the path of the connection string, or null. */
export function databaseOf(uri: string): string | null {
  const name = /^mongodb(?:\+srv)?:\/\/[^/?]+\/([^?]+)/.exec(uri)?.[1];
  return name ?? null;
}

const MISSING_URI =
  'MONGO_URI is required (set it in .env or the environment).';

function checkedUri(
  uri: string | undefined,
):
  | { ok: true; uri: string; database: string }
  | { ok: false; message: string } {
  if (!uri || uri.trim() === '') return { ok: false, message: MISSING_URI };
  const database = databaseOf(uri.trim());
  if (!database) {
    return {
      ok: false,
      message: 'MONGO_URI must name the database (mongodb://host/<database>).',
    };
  }
  return { ok: true, uri: uri.trim(), database };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-26_100509`, in UTC. */
const stamp = (now: Date): string =>
  `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
  `_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;

export function planBackup(input: {
  uri: string | undefined;
  now: Date;
  /** Destination folder; `backups/<date>` by default. */
  out?: string;
  exists: (path: string) => boolean;
}): Plan {
  const checked = checkedUri(input.uri);
  if (!checked.ok) return checked;
  const folder = input.out ?? `backups/${stamp(input.now)}`;
  if (input.exists(folder)) {
    return {
      ok: false,
      message: `The folder "${folder}" already exists: refusing to overwrite it.`,
    };
  }
  return {
    ok: true,
    command: 'mongodump',
    args: [`--uri=${checked.uri}`, `--out=${folder}`],
    folder,
    database: checked.database,
    target: redactUri(checked.uri),
  };
}

export function planRestore(input: {
  uri: string | undefined;
  folder: string | undefined;
  yes: boolean;
  exists: (path: string) => boolean;
}): Plan {
  const checked = checkedUri(input.uri);
  if (!checked.ok) return checked;
  if (!input.folder) {
    return {
      ok: false,
      message: 'Usage: npm run db:restore -- <folder> --yes',
    };
  }
  if (!input.exists(input.folder)) {
    return {
      ok: false,
      message: `The folder "${input.folder}" does not exist.`,
    };
  }
  if (!input.exists(`${input.folder}/${checked.database}`)) {
    return {
      ok: false,
      message: `The folder "${input.folder}" has no dump of the database "${checked.database}".`,
    };
  }
  const target = redactUri(checked.uri);
  if (!input.yes) {
    return {
      ok: false,
      message:
        `This replaces the collections of the database "${checked.database}" at ${target} ` +
        `with the dump in "${input.folder}". Run it again with --yes to continue.`,
    };
  }
  return {
    ok: true,
    command: 'mongorestore',
    args: [
      `--uri=${checked.uri}`,
      '--drop',
      `--nsInclude=${checked.database}.*`,
      input.folder,
    ],
    folder: input.folder,
    database: checked.database,
    target,
  };
}

/** Says which database it touches (credentials hidden) and runs the plan. Answers the exit code. */
export async function runPlan(plan: OkPlan, runner: Runner): Promise<number> {
  runner.log(
    `${plan.command}: database "${plan.database}" at ${plan.target} (folder: ${plan.folder})`,
  );
  try {
    return await runner.spawn(plan.command, plan.args);
  } catch (error) {
    runner.log(
      `Could not start ${plan.command}: ${error instanceof Error ? error.message : String(error)}. ` +
        'Install the MongoDB Database Tools.',
    );
    return 1;
  }
}

const systemRunner: Runner = {
  spawn: (command, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    }),
  log: (line) => console.log(line),
};

function loadEnvFile(): void {
  try {
    process.loadEnvFile(join(process.cwd(), '.env'));
  } catch {
    // No .env: MONGO_URI may come from the environment.
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  loadEnvFile();
  const positional = rest.filter((arg) => !arg.startsWith('--'));
  const plan =
    command === 'backup'
      ? planBackup({
          uri: process.env.MONGO_URI,
          now: new Date(),
          out: positional[0],
          exists: existsSync,
        })
      : command === 'restore'
        ? planRestore({
            uri: process.env.MONGO_URI,
            folder: positional[0],
            yes: rest.includes('--yes'),
            exists: existsSync,
          })
        : ({ ok: false, message: 'Usage: db-backup <backup|restore>' } as Plan);
  if (!plan.ok) {
    console.error(plan.message);
    return 1;
  }
  return runPlan(plan, systemRunner);
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
