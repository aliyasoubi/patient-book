import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';

const sourceRoot = 'src/app';
const dictionaryFile = 'public/i18n/fa.json';
const visibleAttributes = new Set([
  'alt',
  'aria-label',
  'ariaLabel',
  'emptyHint',
  'emptyTitle',
  'hint',
  'label',
  'loadingText',
  'matTooltip',
  'placeholder',
  'shortcut',
  'subtitle',
  'title',
]);
const letters = /[A-Za-z\u0600-\u06ff]/;
const persian = /[\u0600-\u06ff]/;
const translationKey = /^[a-z][\w-]*(?:\.[\w-]+)+$/;
const findings = [];
const htmlFiles = [];
const typeScriptFiles = [];

function collectFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(file);
    else if (file.endsWith('.html')) htmlFiles.push(file);
    else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) typeScriptFiles.push(file);
  }
}

function flattenDictionary(value, prefix = '', result = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      if (!child.trim()) findings.push(`${dictionaryFile}: empty translation for ${fullKey}`);
      result.set(fullKey, child);
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenDictionary(child, fullKey, result);
    } else {
      findings.push(`${dictionaryFile}: ${fullKey} must be a string or nested object`);
    }
  }
  return result;
}

let dictionary;
try {
  dictionary = JSON.parse(fs.readFileSync(dictionaryFile, 'utf8'));
} catch (error) {
  console.error(`${dictionaryFile}: invalid JSON: ${error.message}`);
  process.exit(1);
}
const translations = flattenDictionary(dictionary);

function report(file, line, message) {
  findings.push(`${file}:${line}: ${message}`);
}

function lineAt(source, index, offset = 0) {
  return offset + source.slice(0, index).split('\n').length;
}

function checkKey(key, file, line) {
  if (!translations.has(key)) report(file, line, `missing translation key ${JSON.stringify(key)}`);
}

function checkTemplateKeys(source, file, lineOffset) {
  const pipePattern = /(['"])([a-z][\w-]*(?:\.[\w-]+)+)\1\s*\|\s*translate\b/g;
  for (const match of source.matchAll(pipePattern)) {
    checkKey(match[2], file, lineAt(source, match.index, lineOffset));
  }
}

function checkExpressionLiterals(source, file, lineOffset) {
  const expressions = [
    ...source.matchAll(/\[[^\]]+\]\s*=\s*"([^"]*)"/g),
    ...source.matchAll(/{{([\s\S]*?)}}/g),
  ];
  for (const match of expressions) {
    const expression = match[1];
    const quotedPersian = /['"][^'"]*[\u0600-\u06ff][^'"]*['"]/.test(expression);
    const englishPhrase = /['"][^'"]*[A-Za-z]+\s+[A-Za-z][^'"]*['"]/.test(expression);
    if (!quotedPersian && !englishPhrase) continue;
    report(
      file,
      lineAt(source, match.index, lineOffset),
      `user-visible literal inside an expression: ${match[0].trim()}`,
    );
  }
}

function checkTemplate(source, file, lineOffset = 0) {
  for (const match of source.matchAll(/\bi18n(?:-[A-Za-z-]+)?\b/g)) {
    report(
      file,
      lineAt(source, match.index, lineOffset),
      'legacy Angular i18n marker is not allowed',
    );
  }

  const parsed = parseTemplate(source, file, { preserveWhitespaces: false });
  for (const error of parsed.errors ?? []) report(file, lineOffset + 1, String(error));

  function visit(node, ignored = false) {
    if (!node || typeof node !== 'object') return;
    const kind = node.constructor?.name;

    if (kind === 'Element') {
      const nextIgnored = ignored || node.name === 'mat-icon' || node.name === 'code';
      for (const attribute of node.attributes ?? []) {
        if (visibleAttributes.has(attribute.name) && letters.test(attribute.value)) {
          report(
            file,
            lineOffset + attribute.sourceSpan.start.line + 1,
            `replace visible ${attribute.name} literal with a JSON translation key`,
          );
        }
      }
      for (const child of node.children ?? []) visit(child, nextIgnored);
      return;
    }

    if (kind === 'Text') {
      const value = node.value.replace(/\s+/g, ' ').trim();
      if (!ignored && letters.test(value)) {
        report(
          file,
          lineOffset + node.sourceSpan.start.line + 1,
          `replace visible text ${JSON.stringify(value)} with a JSON translation key`,
        );
      }
      return;
    }

    for (const key of ['children', 'branches', 'cases']) {
      for (const child of node[key] ?? []) visit(child, ignored);
    }
    for (const key of ['empty', 'placeholder', 'loading', 'error']) {
      if (node[key]) visit(node[key], ignored);
    }
  }

  for (const node of parsed.nodes) visit(node);
  checkExpressionLiterals(source, file, lineOffset);
  checkTemplateKeys(source, file, lineOffset);
}

function checkTypeScript(file) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText(sourceFile) === '$localize') {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      report(file, line, '$localize is not allowed; use a JSON translation key');
      return;
    }

    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === 'template' &&
      (ts.isNoSubstitutionTemplateLiteral(node.initializer) || ts.isStringLiteral(node.initializer))
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(
        node.initializer.getStart(sourceFile),
      ).line;
      checkTemplate(node.initializer.text, file, line);
      return;
    }

    if (ts.isStringLiteralLike(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (persian.test(node.text)) {
        report(file, line, `Persian source literal must move to ${dictionaryFile}`);
      }

      if (translationKey.test(node.text)) {
        const root = node.text.split('.')[0];
        if (Object.hasOwn(dictionary, root)) checkKey(node.text, file, line);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

collectFiles(sourceRoot);
htmlFiles.push('src/index.html');
for (const file of htmlFiles) checkTemplate(fs.readFileSync(file, 'utf8'), file);
for (const file of typeScriptFiles) checkTypeScript(file);

if (findings.length > 0) {
  console.error(findings.join('\n'));
  console.error(`\nFound ${findings.length} JSON localization issue(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `JSON localization check passed: ${translations.size} Persian keys; no hardcoded application text.`,
  );
}
