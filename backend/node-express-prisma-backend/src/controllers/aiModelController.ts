import { Request, Response } from 'express';
import { AIModelService } from '../services/aiModelService';

export class AIModelController {
    private aiModelService: AIModelService;

    constructor() {
        this.aiModelService = new AIModelService();
    }

    public async createModel(req: Request, res: Response): Promise<void> {
        try {
            const modelData = req.body;
            const newModel = await this.aiModelService.createModel(modelData);
            res.status(201).json(newModel);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error creating model';
            res.status(500).json({ message, error });
        }
    }

    public async getModel(req: Request, res: Response): Promise<void> {
        try {
            const modelId = req.params.id as string;
            const model = await this.aiModelService.getModel(modelId);
            if (model) {
                res.status(200).json(model);
            } else {
                res.status(404).json({ message: 'Model not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error retrieving model';
            res.status(500).json({ message, error });
        }
    }

    public async updateModel(req: Request, res: Response): Promise<void> {
        try {
            const modelId = req.params.id as string;
            const modelData = req.body;
            const updatedModel = await this.aiModelService.updateModel(modelId, modelData);
            if (updatedModel) {
                res.status(200).json(updatedModel);
            } else {
                res.status(404).json({ message: 'Model not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error updating model';
            res.status(500).json({ message, error });
        }
    }

    public async deleteModel(req: Request, res: Response): Promise<void> {
        try {
            const modelId = req.params.id as string;
            const deletedModel = await this.aiModelService.deleteModel(modelId);
            if (deletedModel) {
                res.status(204).send();
            } else {
                res.status(404).json({ message: 'Model not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error deleting model';
            res.status(500).json({ message, error });
        }
    }
}