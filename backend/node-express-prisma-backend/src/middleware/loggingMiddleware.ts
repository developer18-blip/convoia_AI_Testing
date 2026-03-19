import { Request, Response, NextFunction } from 'express';

const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    console.log(`Incoming Request: ${req.method} ${req.url}`);

    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`Response: ${res.statusCode} ${req.method} ${req.url} - ${duration}ms`);
    });

    next();
};

export default loggingMiddleware;