import { Request, Response } from 'express';
import { UserService } from '../services/userService';

export class UserController {
    private userService: UserService;

    constructor() {
        this.userService = new UserService();
    }

    public async createUser(req: Request, res: Response): Promise<void> {
        try {
            const user = await this.userService.createUser(req.body);
            res.status(201).json(user);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message, error });
        }
    }

    public async getUser(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.params.id as string;
            const user = await this.userService.getUser(userId);
            if (user) {
                res.status(200).json(user);
            } else {
                res.status(404).json({ message: 'User not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message, error });
        }
    }

    public async updateUser(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.params.id as string;
            const updatedUser = await this.userService.updateUser(userId, req.body);
            if (updatedUser) {
                res.status(200).json(updatedUser);
            } else {
                res.status(404).json({ message: 'User not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message, error });
        }
    }

    public async deleteUser(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.params.id as string;
            const deleted = await this.userService.deleteUser(userId);
            if (deleted) {
                res.status(204).send();
            } else {
                res.status(404).json({ message: 'User not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message, error });
        }
    }
}