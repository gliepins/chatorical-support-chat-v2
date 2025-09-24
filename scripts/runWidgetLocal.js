// Minimal local runner to start the server without a real DB
// Mocks Prisma via global.__prisma so tenantContext/settings work
global.__prisma = {
  tenant: {
    findUnique: async ({ where }) => ({ id: 'default', slug: where.slug || 'default' }),
    create: async ({ data }) => ({ id: 'default', ...data })
  },
  setting: {
    findUnique: async () => null
  }
};

require('ts-node/register/transpile-only');
require('../src/index');


