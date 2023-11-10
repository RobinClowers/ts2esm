import fs from 'node:fs';
import path from 'node:path';
import {Project, type ProjectOptions, type StringLiteral} from 'ts-morph';
import {toIndex, toIndexJSX, toJS, toJSON, toJSX} from './util.js';
import {parseInfo, type ModuleInfo} from './parseInfo.js';
import typescript from 'typescript';

const {SyntaxKind} = typescript;

export function convert(options: ProjectOptions, debugLogging: boolean = false) {
  const project = new Project(options);
  const rootDir = project.getRootDirectories()[0]?.getPath();
  if (!rootDir) {
    throw new Error('no root directory path found');
  }

  project.getSourceFiles().forEach(sourceFile => {
    const filePath = sourceFile.getFilePath();
    if (debugLogging) {
      console.log(`Checking: ${filePath}`);
    }

    let madeChanges: boolean = false;

    sourceFile.getImportDeclarations().forEach(importDeclaration => {
      importDeclaration.getDescendantsOfKind(SyntaxKind.StringLiteral).forEach(stringLiteral => {
        const hasAssertClause = !!importDeclaration.getAssertClause();
        const adjustedImport = rewrite(rootDir, filePath, stringLiteral, hasAssertClause, debugLogging);
        madeChanges ||= adjustedImport;
      });
    });

    sourceFile.getExportDeclarations().forEach(exportDeclaration => {
      exportDeclaration.getDescendantsOfKind(SyntaxKind.StringLiteral).forEach(stringLiteral => {
        const adjustedExport = rewrite(rootDir, filePath, stringLiteral, debugLogging);
        madeChanges ||= adjustedExport;
      });
    });

    if (madeChanges) {
      sourceFile.saveSync();
      console.log(`Modified (🔧): ${filePath}`);
    }
  });
}

function rewrite(
  rootDir: string,
  sourceFilePath: string,
  stringLiteral: StringLiteral,
  hasAssertClause: boolean = false,
  debugLogging: boolean = false
) {
  const info = parseInfo(sourceFilePath, stringLiteral);
  const replacement = createReplacementPath(rootDir, info, hasAssertClause, debugLogging);
  if (replacement) {
    stringLiteral.replaceWithText(replacement);
    return true;
  }
  return false;
}

function createReplacementPath(rootDir: string, info: ModuleInfo, hasAssertClause: boolean, debugLogging = false) {
  if (hasAssertClause) {
    return null;
  }

  if (info.isRelative) {
    if (info.extension === '') {
      if (info.normalized.startsWith('~/')) {
        const normalized = info.normalized.replace('~/', '');
        const relativeTsPath = path.join(rootDir, 'src', normalized + '.ts');
        const relativeTsxPath = path.join(rootDir, 'src', normalized + '.tsx');
        const indexPath = path.join(rootDir, 'src', normalized + '/index.ts');
        const indexTsxPath = path.join(rootDir, 'src', normalized + '/index.tsx');
        if (fs.existsSync(relativeTsPath)) {
          return toJS(info);
        }
        if (fs.existsSync(relativeTsxPath)) {
          return toJSX(info);
        }
        if (fs.existsSync(indexPath)) {
          return toIndex(info);
        }
        if (fs.existsSync(indexTsxPath)) {
          return toIndexJSX(info);
        }
        if (debugLogging) {
          console.log(`  relativeTsPath: ${relativeTsPath}`);
          console.log(`  relativeTsxPath: ${relativeTsxPath}`);
        }
      }
      const tsPath = path.join(info.directory, info.normalized + '.ts');
      const tsxPath = path.join(info.directory, info.normalized + '.tsx');
      const indexTsxPath = path.join(info.directory, info.normalized + '/index.tsx');
      const indexPath = path.join(info.directory, info.normalized + '/index.ts');
      if (fs.existsSync(tsPath)) {
        return toJS(info);
      }
      if (fs.existsSync(tsxPath)) {
        return toJSX(info);
      }
      if (fs.existsSync(indexTsxPath)) {
        return toIndexJSX(info);
      }
      if (fs.existsSync(indexPath)) {
        return toIndex(info);
      }
    } else if (info.extension === '.json') {
      return toJSON(info);
    }
    if (debugLogging) {
      console.log(`  no replacement: ${info.declaration}`);
    }
    return null;
  }
  // console.log(`  notRelative: ${info.declaration}`);
  return null;
}
