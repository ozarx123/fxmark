module.exports = {
  apps: [
    {
      name: 'fxmark-backend-staging',
      cwd: './backend',
      script: 'scripts/start-staging.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'staging',
        BACKEND_ENV_FILE: '.env.staging',
      },
    },
    {
      name: 'fxmark-frontend-staging',
      cwd: './frontend-web',
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host 0.0.0.0 --port 8081',
      interpreter: 'node',
      env: {
        NODE_ENV: 'staging',
      },
    },
  ],
};
