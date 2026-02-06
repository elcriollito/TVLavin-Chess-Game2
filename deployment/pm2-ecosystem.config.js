// PM2 Ecosystem Configuration for FICS Gateway
// File: /opt/fics-gateway/ecosystem.config.js
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup

module.exports = {
  apps: [{
    name: 'fics-gateway',
    script: './server/fics-gateway.cjs',

    // Process management
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',

    // Environment
    env: {
      NODE_ENV: 'production',
      FICS_GATEWAY_PORT: 8081
    },

    // Logging
    error_file: '/var/log/fics-gateway/error.log',
    out_file: '/var/log/fics-gateway/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Advanced
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,

    // Monitoring (optional)
    // pmx: true,
    // vizion: true
  }]
};
