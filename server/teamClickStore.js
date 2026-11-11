import {readFileSync} from 'node:fs';
const source = () => readFileSync(new URL('../shared/team-click-store.js', import.meta.url), 'utf8');
export function teamClickStorePlugin() {
  return {
    name: 'team-click-handoff-store',
    configureServer(server) {
      server.middlewares.use('/team-click-store.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-store');
        res.end(source());
      });
    },
    generateBundle() {
      this.emitFile({type: 'asset', fileName: 'team-click-store.js', source: source()});
    },
  };
}
