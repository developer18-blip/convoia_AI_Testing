import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const databaseConfig = {
  client: prisma,
  url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/mydb',
};

export default databaseConfig;