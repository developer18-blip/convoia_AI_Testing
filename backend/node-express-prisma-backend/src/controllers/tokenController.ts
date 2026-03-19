import { Request, Response } from 'express';
import { TokenService } from '../services/tokenService';

export class TokenController {
    private tokenService: TokenService;

    constructor() {
        this.tokenService = new TokenService();
    }

    public generateToken = async (req: Request, res: Response) => {
        try {
            const { userId } = req.body;
            const token = await this.tokenService.generateToken(userId);
            res.status(201).json({ token });
        } catch (error) {
            res.status(500).json({ message: 'Error generating token', error });
        }
    };

    public validateToken = async (req: Request, res: Response) => {
        try {
            const { token } = req.body;
            const isValid = await this.tokenService.validateToken(token);
            res.status(200).json({ isValid });
        } catch (error) {
            res.status(500).json({ message: 'Error validating token', error });
        }
    };

    public revokeToken = async (req: Request, res: Response) => {
        try {
            const { token } = req.body;
            await this.tokenService.revokeToken(token);
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ message: 'Error revoking token', error });
        }
    };
}