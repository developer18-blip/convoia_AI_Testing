import morgan, { StreamOptions } from 'morgan';
import logger from '../config/logger.js';

// Create a stream object for morgan
const stream: StreamOptions = {
  write: (message: string) => {
    logger.http(message);
  },
};

// Morgan logger middleware
const morganMiddleware = morgan(
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
  { stream }
);

export default morganMiddleware;
