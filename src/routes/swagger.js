/**
 * Swagger API Documentation Route
 *
 * Mounts Swagger UI at /api/docs and OpenAPI spec JSON at /api/docs/spec.
 * Uses swagger-jsdoc to auto-generate OpenAPI 3.0 spec from JSDoc comments
 * in route files under src/routes/.
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DayCost API',
      version: '1.1.0',
      description: 'DayCost — 日摊成本计算工具 API. 计算物品持有期的日摊成本，揭示隐性代价。',
    },
    servers: [
      { url: '/api', description: 'Current server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /auth/login or /auth/register',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: '_csrf',
          description: 'CSRF token cookie (Double Submit Cookie pattern)',
        },
      },
    },
    security: [
      { bearerAuth: [] },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const specs = swaggerJsdoc(options);

/**
 * Register Swagger routes on the Express app.
 * @param {import('express').Express} app - Express application instance
 */
function registerSwaggerRoutes(app) {
  // Swagger UI — interactive API documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'DayCost API Docs',
  }));

  // OpenAPI spec JSON endpoint
  app.get('/api/docs/spec', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
}

module.exports = { registerSwaggerRoutes, specs };
