export interface DiscoveredImportFile {
  handle: string;
  filename: string;
  path: string;
  content: string;
}

/**
 * Looks for CSV files under import/<HANDLE>/*.csv in the project root.
 * That folder is gitignored — it only exists on your machine, and only
 * matters when running `npm run dev` locally. In a production build (e.g.
 * the GitHub Actions deploy) the folder isn't present, so this returns [].
 *
 * <HANDLE> must match an account's `handle` field exactly (see the Accounts
 * panel) — that's how a dropped-in file gets matched to the right account.
 */
export function discoverImportFiles(): DiscoveredImportFile[] {
  if (!import.meta.env.DEV) return [];

  const modules = import.meta.glob('/import/*/*.csv', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;

  return Object.entries(modules).map(([path, content]) => {
    const parts = path.split('/'); // '', 'import', '<HANDLE>', 'file.csv'
    return {
      handle: parts[2] ?? '',
      filename: parts[3] ?? path,
      path,
      content,
    };
  });
}
