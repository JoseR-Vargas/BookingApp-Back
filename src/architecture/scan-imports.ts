import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';

/** One broken layer rule, located in a source file. */
export interface Violation {
  file: string;
  line: number;
  rule: string;
}

type Layer = 'domain' | 'application';

/** What a source file takes from a module specifier. `null` names: everything (default, namespace, `*`, `require`, `import()`). */
interface ImportRef {
  specifier: string;
  names: string[] | null;
  line: number;
}

const FRAMEWORK_PACKAGES = [
  'mongoose',
  'rxjs',
  'express',
  'socket.io',
  'nodemailer',
];
const DOMAIN_FORBIDDEN_PACKAGES = ['@nestjs', ...FRAMEWORK_PACKAGES];
const APPLICATION_FORBIDDEN_PACKAGES = [
  'mongoose',
  '@nestjs/mongoose',
  '@nestjs/platform-express',
  'express',
  'socket.io',
  'nodemailer',
];
const APPLICATION_NEST_PACKAGE = '@nestjs/common';
// `Optional` marks a collaborator a use case works without (the cache, the storage gate: spec 22).
const APPLICATION_NEST_NAMES = ['Injectable', 'Inject', 'Optional'];

/** Layers that a layer may never import, by path segment. */
const FORBIDDEN_SEGMENTS: Record<Layer, string[]> = {
  domain: ['application', 'infrastructure'],
  application: ['infrastructure'],
};

const isPackage = (specifier: string, pkg: string): boolean =>
  specifier === pkg || specifier.startsWith(`${pkg}/`);

const isExempt = (file: string): boolean =>
  /\.(spec|testing)\.ts$/.test(file) || file.endsWith('.d.ts');

function listSourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return path.endsWith('.ts') && !isExempt(path) ? [path] : [];
  });
}

const stringArg = (node: ts.CallExpression): string | undefined => {
  const [first] = node.arguments;
  return first && ts.isStringLiteralLike(first) ? first.text : undefined;
};

/** Static imports, `export ... from`, `require(...)` and dynamic `import(...)`, plus `process.env` / `new Date()` uses. */
function scan(source: ts.SourceFile): {
  imports: ImportRef[];
  processEnv: number[];
  systemClock: number[];
  throws: number[];
} {
  const imports: ImportRef[] = [];
  const processEnv: number[] = [];
  const systemClock: number[] = [];
  const throws: number[] = [];
  const lineOf = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    if (ts.isThrowStatement(node)) {
      throws.push(lineOf(node));
    } else if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      let names: string[] | null = [];
      if (clause?.name || (bindings && ts.isNamespaceImport(bindings))) {
        names = null;
      } else if (bindings && ts.isNamedImports(bindings)) {
        names = bindings.elements.map((e) => (e.propertyName ?? e.name).text);
      }
      imports.push({
        specifier: node.moduleSpecifier.text,
        names,
        line: lineOf(node),
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const exported = node.exportClause;
      imports.push({
        specifier: node.moduleSpecifier.text,
        names:
          exported && ts.isNamedExports(exported)
            ? exported.elements.map((e) => (e.propertyName ?? e.name).text)
            : null,
        line: lineOf(node),
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      imports.push({
        specifier: node.moduleReference.expression.text,
        names: null,
        line: lineOf(node),
      });
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
      const isDynamic = callee.kind === ts.SyntaxKind.ImportKeyword;
      const specifier = isRequire || isDynamic ? stringArg(node) : undefined;
      if (specifier !== undefined) {
        imports.push({ specifier, names: null, line: lineOf(node) });
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      if (node.expression.text === 'process' && node.name.text === 'env') {
        processEnv.push(lineOf(node));
      }
      if (node.expression.text === 'Date' && node.name.text === 'now') {
        systemClock.push(lineOf(node));
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date' &&
      (node.arguments?.length ?? 0) === 0
    ) {
      systemClock.push(lineOf(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, processEnv, systemClock, throws };
}

function checkImport(layer: Layer, ref: ImportRef): string | undefined {
  const { specifier, names } = ref;

  if (specifier.startsWith('.') || specifier.startsWith('src/')) {
    const crossed = specifier
      .split('/')
      .find((segment) => FORBIDDEN_SEGMENTS[layer].includes(segment));
    return crossed
      ? `${layer} must not import ${crossed} ("${specifier}")`
      : undefined;
  }

  if (layer === 'domain') {
    const pkg = DOMAIN_FORBIDDEN_PACKAGES.find((p) => isPackage(specifier, p));
    return pkg ? `domain must not import "${specifier}"` : undefined;
  }

  if (isPackage(specifier, APPLICATION_NEST_PACKAGE)) {
    const allowed =
      specifier === APPLICATION_NEST_PACKAGE &&
      names !== null &&
      names.every((name) => APPLICATION_NEST_NAMES.includes(name));
    return allowed
      ? undefined
      : `application may import only ${APPLICATION_NEST_NAMES.join(' and ')} from "${APPLICATION_NEST_PACKAGE}" ("${specifier}")`;
  }
  if (isPackage(specifier, '@nestjs')) {
    return `application must not import "${specifier}"`;
  }
  return APPLICATION_FORBIDDEN_PACKAGES.some((p) => isPackage(specifier, p))
    ? `application must not import "${specifier}"`
    : undefined;
}

function checkFile(
  layer: Layer,
  file: string,
  forbidThrow: boolean,
): Violation[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found = scan(source);
  const violations: Violation[] = [];
  for (const ref of found.imports) {
    const rule = checkImport(layer, ref);
    if (rule) violations.push({ file, line: ref.line, rule });
  }
  for (const line of found.processEnv) {
    violations.push({ file, line, rule: `${layer} must not read process.env` });
  }
  for (const line of found.systemClock) {
    violations.push({
      file,
      line,
      rule: `${layer} must not read the system clock (new Date() / Date.now()): inject a Clock`,
    });
  }
  if (forbidThrow) {
    for (const line of found.throws) {
      violations.push({
        file,
        line,
        rule: `${layer} must not throw: business failures are returned as Result (err(...))`,
      });
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}

/** Where a `throw` is forbidden once a module returns Result: all of `domain/`, and `application/use-cases/` (ports are contracts, not logic). */
const forbidsThrow = (layer: Layer, layerDir: string, file: string): boolean =>
  layer === 'domain' || relative(layerDir, file).startsWith(`use-cases${sep}`);

/**
 * Checks the layer rules of one module folder (`src/<module>` or `src/shared`):
 * every non-test `.ts` under `domain/` and `application/`. Test files
 * (`*.spec.ts`, `*.testing.ts`) are exempt. With `noThrow` (modules listed in
 * RESULT_MODULES) a `throw` in `domain/` or `application/use-cases/` is a violation too.
 */
export function checkModule(
  moduleDir: string,
  options: { noThrow?: boolean } = {},
): Violation[] {
  const layers: Layer[] = ['domain', 'application'];
  return layers.flatMap((layer) => {
    const layerDir = join(moduleDir, layer);
    return listSourceFiles(layerDir).flatMap((file) =>
      checkFile(
        layer,
        file,
        options.noThrow === true && forbidsThrow(layer, layerDir, file),
      ),
    );
  });
}

/** `path/from/base.ts:12 rule`, for readable assertion failures. */
export function formatViolation(violation: Violation, base: string): string {
  return `${relative(base, violation.file)}:${violation.line} ${violation.rule}`;
}
