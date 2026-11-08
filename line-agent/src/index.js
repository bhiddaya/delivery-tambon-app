import { loadConfig, missingSecrets } from './config.js';
import { createServer } from './server.js';

const cfg = loadConfig();
const missing = missingSecrets(cfg);
if (missing.length) {
  console.log(JSON.stringify({ event: 'config_missing', missing }));
}
createServer(cfg).listen(cfg.port, () => {
  console.log(JSON.stringify({ event: 'listening', port: cfg.port }));
});
