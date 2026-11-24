import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkModule } from './scan-imports';

/** Fixture modules live in a temp dir outside src and are removed after each test. */
describe('checkModule (the architecture checker checks itself)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'arch-fixture-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const write = async (file: string, content: string) => {
    const path = join(root, 'mod', file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };

  const check = () => checkModule(join(root, 'mod'));

  it('passes a clean module', async () => {
    await write('domain/a.ts', `export const a = 1;\n`);
    await write(
      'domain/b.ts',
      `import { a } from './a';\nimport { E } from '../../shared/domain/e';\nexport const b = a;\n`,
    );
    await write(
      'application/use.ts',
      `import { Inject, Injectable } from '@nestjs/common';\nimport { a } from '../domain/a';\nimport type { Port } from './ports/p';\nexport const x = [Inject, Injectable, a];\n`,
    );
    await write(
      'infrastructure/repo.ts',
      `import mongoose from 'mongoose';\nimport { Controller } from '@nestjs/common';\nimport { a } from '../domain/a';\nexport const r = [mongoose, Controller, a, new Date(), process.env];\n`,
    );
    expect(check()).toEqual([]);
  });

  it('ignores comments, strings and spec/testing files', async () => {
    await write(
      'domain/a.ts',
      `// import 'mongoose'; new Date(); process.env\n/* require('mongoose') */\nexport const s = "import x from 'mongoose'";\n`,
    );
    await write('domain/a.spec.ts', `import 'mongoose';\nnew Date();\n`);
    await write('application/fake.testing.ts', `import 'mongoose';\n`);
    expect(check()).toEqual([]);
  });

  it.each([
    ['static import', `import { Schema } from 'mongoose';`],
    ['side-effect import', `import 'mongoose';`],
    ['type import', `import type { Model } from 'mongoose';`],
    ['export from', `export { Schema } from 'mongoose';`],
    ['export star', `export * from 'mongoose';`],
    ['require', `const m = require('mongoose');`],
    ['dynamic import', `const m = import('mongoose');`],
    ['nest import', `import { Controller } from '@nestjs/common';`],
    ['nest subpath', `import { X } from '@nestjs/mongoose';`],
    ['rxjs', `import { of } from 'rxjs';`],
    ['express', `import { Request } from 'express';`],
    ['socket.io', `import { Server } from 'socket.io';`],
    ['nodemailer', `import * as n from 'nodemailer';`],
    ['application', `import { U } from '../application/use';`],
    ['infrastructure', `import { R } from '../infrastructure/repo';`],
    ['infrastructure via export', `export * from '../infrastructure/repo';`],
    ['infrastructure via require', `require('../infrastructure/repo');`],
    ['new Date()', `export const now = new Date();`],
    ['Date.now()', `export const now = Date.now();`],
    ['process.env', `export const k = process.env.KEY;`],
  ])('flags a domain %s', async (_name, code) => {
    await write('domain/bad.ts', `${code}\n`);
    const violations = check();
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(join(root, 'mod', 'domain', 'bad.ts'));
    expect(violations[0].line).toBe(1);
  });

  it.each([
    ['mongoose', `import { Schema } from 'mongoose';`],
    ['@nestjs/mongoose', `import { Prop } from '@nestjs/mongoose';`],
    [
      '@nestjs/platform-express',
      `import { Express } from '@nestjs/platform-express';`,
    ],
    ['@nestjs/core', `import { Reflector } from '@nestjs/core';`],
    ['socket.io', `import { Server } from 'socket.io';`],
    ['nodemailer', `import * as n from 'nodemailer';`],
    ['express', `import { Response } from 'express';`],
    [
      'a Nest decorator other than Injectable/Inject',
      `import { Controller } from '@nestjs/common';`,
    ],
    [
      'a Nest exception',
      `import { Inject, BadRequestException } from '@nestjs/common';`,
    ],
    ['a default Nest import', `import common from '@nestjs/common';`],
    ['a namespace Nest import', `import * as common from '@nestjs/common';`],
    ['a dynamic Nest import', `const c = import('@nestjs/common');`],
    ['infrastructure', `import { R } from '../infrastructure/repo';`],
    ['new Date()', `export const now = new Date();`],
    ['process.env', `export const k = process.env.KEY;`],
  ])('flags an application import of %s', async (_name, code) => {
    await write('application/bad.ts', `${code}\n`);
    const violations = check();
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(join(root, 'mod', 'application', 'bad.ts'));
  });

  it('reports every violation with its file and line', async () => {
    await write(
      'domain/two.ts',
      `import { a } from 'mongoose';\n\nexport const t = new Date();\n`,
    );
    const violations = check();
    expect(violations.map((v) => v.line)).toEqual([1, 3]);
    expect(violations.every((v) => v.rule.length > 0)).toBe(true);
  });

  it('allows a new Date with an argument (a value, not the system clock)', async () => {
    await write(
      'domain/d.ts',
      `export const d = (n: number) => new Date(n);\n`,
    );
    expect(check()).toEqual([]);
  });

  it('scans nested folders', async () => {
    await write('domain/deep/er/x.ts', `import 'mongoose';\n`);
    expect(check()).toHaveLength(1);
  });

  describe('no-throw rule (modules that return Result)', () => {
    const checkResult = () => checkModule(join(root, 'mod'), { noThrow: true });

    it('flags a throw in domain and in application/use-cases', async () => {
      await write(
        'domain/rule.ts',
        `export function f() {\n  throw new Error('x');\n}\n`,
      );
      await write(
        'application/use-cases/do.use-case.ts',
        `export const g = () => {\n  throw new Error('x');\n};\n`,
      );
      const violations = checkResult();
      expect(violations.map((v) => [v.file, v.line])).toEqual([
        [join(root, 'mod', 'domain', 'rule.ts'), 2],
        [join(root, 'mod', 'application', 'use-cases', 'do.use-case.ts'), 2],
      ]);
      expect(violations.every((v) => v.rule.includes('throw'))).toBe(true);
    });

    it('flags a throw nested in a class method, a closure or a catch', async () => {
      await write(
        'domain/nested.ts',
        `export class C {\n  m() {\n    try {\n      [1].map(() => {\n        throw 1;\n      });\n    } catch (e) {\n      throw e;\n    }\n  }\n}\n`,
      );
      expect(checkResult().map((v) => v.line)).toEqual([5, 8]);
    });

    it('passes code that returns err(...)', async () => {
      await write(
        'domain/rule.ts',
        `import { err, ok } from '../../shared/domain/result';\nexport const f = (n: number) => (n > 0 ? ok(n) : err(new Error('x')));\n`,
      );
      await write(
        'application/use-cases/do.use-case.ts',
        `import { err } from '../../../shared/domain/result';\nexport const g = () => {\n  return err(new Error('x'));\n};\n`,
      );
      expect(checkResult()).toEqual([]);
    });

    it('ignores the word throw in comments and strings, and spec/testing files', async () => {
      await write(
        'domain/words.ts',
        `// throw new Error('x')\nexport const s = "throw 1";\n`,
      );
      await write('domain/rule.spec.ts', `throw new Error('x');\n`);
      await write('application/use-cases/fake.testing.ts', `throw 1;\n`);
      expect(checkResult()).toEqual([]);
    });

    it('does not cover ports or infrastructure', async () => {
      await write(
        'application/ports/p.ts',
        `export const p = () => {\n  throw 1;\n};\n`,
      );
      await write(
        'infrastructure/http/c.ts',
        `export const c = () => {\n  throw 1;\n};\n`,
      );
      expect(checkResult()).toEqual([]);
    });

    it('is off by default: modules not in RESULT_MODULES may throw', async () => {
      await write(
        'domain/rule.ts',
        `export const f = () => {\n  throw 1;\n};\n`,
      );
      expect(check()).toEqual([]);
    });
  });

  it('returns nothing for a module without layers', async () => {
    await mkdir(join(root, 'mod'), { recursive: true });
    expect(check()).toEqual([]);
  });
});
