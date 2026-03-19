import databaseConfig from './database';
import prismaClient from './prisma';

const config = {
  database: databaseConfig,
  prisma: prismaClient,
};

export default config;