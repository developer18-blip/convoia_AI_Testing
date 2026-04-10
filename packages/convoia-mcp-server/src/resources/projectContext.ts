/**
 * Project Context Resources — file tree and tech stack detection.
 */

import * as fs from 'fs';
import * as path from 'path';

const IGNORED = ['node_modules', '.git', 'dist', '__pycache__', '.next', '.nuxt', 'coverage', '.cache', 'build', '.svelte-kit', '.turbo'];

export async function getProjectStructure(workspaceRoot: string): Promise<string> {
  return buildTree(workspaceRoot, 0, 3);
}

function buildTree(dir: string, depth: number, maxDepth: number): string {
  if (depth >= maxDepth) return '';
  let result = '';
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !IGNORED.includes(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));

    const indent = '  '.repeat(depth);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        result += `${indent}${entry.name}/\n`;
        result += buildTree(path.join(dir, entry.name), depth + 1, maxDepth);
      } else {
        result += `${indent}${entry.name}\n`;
      }
    }
  } catch { /* skip unreadable dirs */ }
  return result;
}

export async function getTechStack(workspaceRoot: string): Promise<Record<string, unknown>> {
  const stack: Record<string, unknown> = { languages: [], frameworks: [], packageManager: '', scripts: {} };

  // package.json
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      stack.name = pkg.name;
      stack.scripts = pkg.scripts || {};
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depNames = Object.keys(allDeps);

      const languages: string[] = ['JavaScript'];
      if (depNames.includes('typescript') || fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'))) languages.push('TypeScript');

      const frameworks: string[] = [];
      if (depNames.includes('react')) frameworks.push('React');
      if (depNames.includes('next')) frameworks.push('Next.js');
      if (depNames.includes('vue')) frameworks.push('Vue');
      if (depNames.includes('svelte')) frameworks.push('Svelte');
      if (depNames.includes('express')) frameworks.push('Express');
      if (depNames.includes('@nestjs/core')) frameworks.push('NestJS');
      if (depNames.includes('fastify')) frameworks.push('Fastify');
      if (depNames.includes('prisma') || depNames.includes('@prisma/client')) frameworks.push('Prisma');
      if (depNames.includes('tailwindcss')) frameworks.push('Tailwind CSS');
      if (depNames.includes('jest') || depNames.includes('vitest')) frameworks.push(depNames.includes('vitest') ? 'Vitest' : 'Jest');

      stack.languages = languages;
      stack.frameworks = frameworks;
      stack.dependencies = Object.keys(pkg.dependencies || {}).length;
      stack.devDependencies = Object.keys(pkg.devDependencies || {}).length;

      if (fs.existsSync(path.join(workspaceRoot, 'yarn.lock'))) stack.packageManager = 'yarn';
      else if (fs.existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) stack.packageManager = 'pnpm';
      else if (fs.existsSync(path.join(workspaceRoot, 'bun.lockb'))) stack.packageManager = 'bun';
      else stack.packageManager = 'npm';
    } catch { /* skip malformed package.json */ }
  }

  // Python
  if (fs.existsSync(path.join(workspaceRoot, 'requirements.txt')) || fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))) {
    (stack.languages as string[]).push('Python');
    if (fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))) {
      try {
        const content = fs.readFileSync(path.join(workspaceRoot, 'pyproject.toml'), 'utf-8');
        if (content.includes('fastapi')) (stack.frameworks as string[]).push('FastAPI');
        if (content.includes('django')) (stack.frameworks as string[]).push('Django');
        if (content.includes('flask')) (stack.frameworks as string[]).push('Flask');
      } catch { /* skip */ }
    }
  }

  // Go
  if (fs.existsSync(path.join(workspaceRoot, 'go.mod'))) (stack.languages as string[]).push('Go');

  // Rust
  if (fs.existsSync(path.join(workspaceRoot, 'Cargo.toml'))) (stack.languages as string[]).push('Rust');

  // Docker
  if (fs.existsSync(path.join(workspaceRoot, 'Dockerfile'))) stack.docker = true;
  if (fs.existsSync(path.join(workspaceRoot, 'docker-compose.yml')) || fs.existsSync(path.join(workspaceRoot, 'docker-compose.yaml'))) stack.dockerCompose = true;

  return stack;
}
