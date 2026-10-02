// Historical failing results remain in frontend-probes.log.
// Execute the maintained 1.1 behavior tests against current production sources.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const result = spawnSync(process.execPath, ['--test', 'tests/business-contracts.test.mjs'], {
  cwd: path.join(root, 'APP'), stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
