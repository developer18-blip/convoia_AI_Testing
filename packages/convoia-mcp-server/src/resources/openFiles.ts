/**
 * Open Files Resource — tracks files currently open in the editor.
 * VS Code extension pushes updates; MCP server returns them as a resource.
 */

interface OpenFile {
  path: string;
  language: string;
  lineCount: number;
  dirty: boolean;
}

let openFiles: OpenFile[] = [];

export function setOpenFiles(files: OpenFile[]): void {
  openFiles = files;
}

export function getOpenFiles(): OpenFile[] {
  return openFiles;
}
