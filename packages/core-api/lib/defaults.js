const path = require('path')

module.exports = {
  enabled: false,
  host: process.env.ARK_API_HOST || '0.0.0.0',
  port: process.env.ARK_API_PORT || 4003,
  cache: {
    /**
     * How many seconds the server will try to complete the request and cache the result.
     *
     * Defaults to 8 seconds, set it to false if you do not care about the timeout.
     *
     * Setting it to false can result in requests never being completed, which is usually
     * caused by low-spec servers that are unable to handle the heavy load that results
     * out of SQL queries on the blocks and transactions tables.
     *
     * If you experience issues with the cache timeout, which is indicated by a 503 status codes,
     * you should consider upgrading your hardware or tweak your PostgreSQL settings.
     */
    generateTimeout: process.env.ARK_API_CACHE_TIMEOUT || 8000,
  },
  // @see https://hapijs.com/api#-serveroptionstls
  ssl: {
    enabled: process.env.ARK_API_SSL,
    host: process.env.ARK_API_SSL_HOST || '0.0.0.0',
    port: process.env.ARK_API_SSL_PORT || 8443,
    key: process.env.ARK_API_SSL_KEY,
    cert: process.env.ARK_API_SSL_CERT,
  },
  // @see https://github.com/p-meier/hapi-api-version
  versions: {
    validVersions: [1, 2],
    defaultVersion: 1,
    basePath: '/api/',
    vendorName: 'ark.core-api',
  },
  // @see https://github.com/wraithgar/hapi-rate-limit
  rateLimit: {
    enabled: !process.env.ARK_API_RATE_LIMIT,
    pathLimit: false,
    userLimit: process.env.ARK_API_RATE_LIMIT_USER_LIMIT || 300,
    userCache: {
      expiresIn: process.env.ARK_API_RATE_LIMIT_USER_EXPIRES || 60000,
    },
    ipWhitelist: ['127.0.0.1', '::ffff:127.0.0.1'],
  },
  // @see https://github.com/fknop/hapi-pagination
  pagination: {
    limit: 100,
    include: [
      '/api/v2/blocks',
      '/api/v2/blocks/{id}/transactions',
      '/api/v2/blocks/search',
      '/api/v2/delegates',
      '/api/v2/delegates/{id}/blocks',
      '/api/v2/delegates/{id}/voters',
      '/api/v2/delegates/search',
      '/api/v2/peers',
      '/api/v2/transactions',
      '/api/v2/transactions/search',
      '/api/v2/transactions/unconfirmed',
      '/api/v2/votes',
      '/api/v2/wallets',
      '/api/v2/wallets/top',
      '/api/v2/wallets/{id}/transactions',
      '/api/v2/wallets/{id}/transactions/received',
      '/api/v2/wallets/{id}/transactions/sent',
      '/api/v2/wallets/{id}/votes',
      '/api/v2/wallets/search',
    ],
  },
  whitelist: ['127.0.0.1', '::ffff:127.0.0.1'],
  plugins: [
    {
      plugin: path.resolve(__dirname, './versions/1'),
      routes: { prefix: '/api/v1' },
    },
    {
      plugin: path.resolve(__dirname, './versions/2'),
      routes: { prefix: '/api/v2' },
    },
  ],
}