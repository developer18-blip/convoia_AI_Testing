import jwt from 'jsonwebtoken';

export class TokenService {
    private jwtSecret: string;

    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret'; // Use environment variable for security
    }

    async generateToken(userId: string): Promise<string> {
        const token = jwt.sign({ userId }, this.jwtSecret, { expiresIn: '7d' });
        return token;
    }

    async validateToken(token: string): Promise<boolean> {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            return !!decoded;
        } catch (error) {
            return false;
        }
    }

    async revokeToken(token: string): Promise<void> {
        // In a real application, you would add the token to a blacklist
        // For now, just acknowledge the request
    }
}