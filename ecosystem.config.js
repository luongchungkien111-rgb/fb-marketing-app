// Cau hinh PM2 - giup app tu khoi dong lai khi bi crash, va tu chay lai khi
// khoi dong lai may (sau khi thiet lap pm2 startup mot lan).
module.exports = {
  apps: [
    {
      name: 'fb-marketing-app',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './data/pm2-error.log',
      out_file: './data/pm2-out.log',
      time: true,
    },
  ],
};
