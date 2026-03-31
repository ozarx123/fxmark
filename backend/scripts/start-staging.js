process.env.NODE_ENV = process.env.NODE_ENV || 'staging';
process.env.BACKEND_ENV_FILE = process.env.BACKEND_ENV_FILE || '.env.staging';

await import('../src/index.js');
