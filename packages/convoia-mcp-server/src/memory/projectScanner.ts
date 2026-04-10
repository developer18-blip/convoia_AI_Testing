/**
 * Project Scanner — detects tech stack, counts files, reads configs.
 * Runs on startup and when workspace changes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

export interface ProjectScanResult {
  name: string;
  languages: string[];
  frameworks: string[];
  packageManager: string;
  fileCount: Record<string, number>; // extension → count
  hasTests: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  gitIgnorePatterns: string[];
}

export async function scanProject(workspaceRoot: string): Promise<ProjectScanResult> {
  const result: ProjectScanResult = {
    name: path.basename(workspaceRoot),
    languages: [],
    frameworks: [],
    packageManager: 'unknown',
    fileCount: {},
    hasTests: false,
    hasDocker: false,
    hasCI: false,
    gitIgnorePatterns: [],
  };

  // Count files by extension
  const files = glob.sync('**/*', {
    cwd: workspaceRoot,
    nodir: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/__pycache__/**'],
  });

  for (const file of files) {
    const ext = path.extname(file).toLowerCase() || '(no ext)';
    result.fileCount[ext] = (result.fileCount[ext] || 0) + 1;
  }

  // Detect languages from file extensions
  if (result.fileCount['.ts'] || result.fileCount['.tsx']) result.languages.push('TypeScript');
  if (result.fileCount['.js'] || result.fileCount['.jsx']) result.languages.push('JavaScript');
  if (result.fileCount['.py']) result.languages.push('Python');
  if (result.fileCount['.go']) result.languages.push('Go');
  if (result.fileCount['.rs']) result.languages.push('Rust');
  if (result.fileCount['.java']) result.languages.push('Java');
  if (result.fileCount['.rb']) result.languages.push('Ruby');
  if (result.fileCount['.php']) result.languages.push('PHP');
  if (result.fileCount['.cs']) result.languages.push('C#');
  if (result.fileCount['.cpp'] || result.fileCount['.cc']) result.languages.push('C++');

  // package.json analysis
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      result.name = pkg.name || result.name;
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

      if (deps.includes('react')) result.frameworks.push('React');
      if (deps.includes('next')) result.frameworks.push('Next.js');
      if (deps.includes('vue')) result.frameworks.push('Vue');
      if (deps.includes('express')) result.frameworks.push('Express');
      if (deps.includes('@prisma/client')) result.frameworks.push('Prisma');
      if (deps.includes('jest')) { result.frameworks.push('Jest'); result.hasTests = true; }
      if (deps.includes('vitest')) { result.frameworks.push('Vitest'); result.hasTests = true; }

      if (fs.existsSync(path.join(workspaceRoot, 'yarn.lock'))) result.packageManager = 'yarn';
      else if (fs.existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) result.packageManager = 'pnpm';
      else result.packageManager = 'npm';
    } catch { /* skip */ }
  }

  // Python
  if (fs.existsSync(path.join(workspaceRoot, 'requirements.txt'))) result.packageManager = 'pip';
  if (fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))) result.packageManager = 'poetry/pip';

  // Docker / CI
  result.hasDocker = fs.existsSync(path.join(workspaceRoot, 'Dockerfile'));
  result.hasCI = fs.existsSync(path.join(workspaceRoot, '.github/workflows')) ||
    fs.existsSync(path.join(workspaceRoot, '.gitlab-ci.yml'));

  // .gitignore
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    result.gitIgnorePatterns = fs.readFileSync(gitignorePath, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  }

  // Tests directory check
  if (!result.hasTests) {
    result.hasTests = fs.existsSync(path.join(workspaceRoot, 'tests')) ||
      fs.existsSync(path.join(workspaceRoot, '__tests__')) ||
      fs.existsSync(path.join(workspaceRoot, 'test'));
  }

  return result;
}
