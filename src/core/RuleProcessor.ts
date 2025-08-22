import * as path from 'path';

/**
 * Concatenates markdown rule files into a single string,
 * marking each section with its source filename.
 */
export function concatenateRules(
  files: { path: string; content: string }[],
  baseDir?: string,
): string {
  const base = baseDir || process.cwd();
  const sections = files.map(({ path: filePath, content }) => {
    const rel = path.relative(base, filePath);
    return ['---', `Source: ${rel}`, '---', content.trim(), ''].join('\n');
  });
  return sections.join('\n');
}
