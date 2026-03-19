import express from 'express';
import { json } from 'body-parser';
import organizationRoutes from './routes/organizationRoutes';
import userRoutes from './routes/userRoutes';
import aiModelRoutes from './routes/aiModelRoutes';
import tokenRoutes from './routes/tokenRoutes';
import errorHandler from './middleware/errorHandler';
import loggingMiddleware from './middleware/loggingMiddleware';

const app = express();

app.use(json());
app.use(loggingMiddleware);

app.use('/api/organizations', organizationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/models', aiModelRoutes);
app.use('/api/tokens', tokenRoutes);

app.use(errorHandler);

export default app;