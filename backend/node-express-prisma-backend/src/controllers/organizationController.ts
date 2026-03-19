import { Request, Response } from 'express';
import { OrganizationService } from '../services/organizationService';

export class OrganizationController {
    private organizationService: OrganizationService;

    constructor() {
        this.organizationService = new OrganizationService();
    }

    public async createOrganization(req: Request, res: Response): Promise<void> {
        try {
            const organizationData = req.body;
            const newOrganization = await this.organizationService.createOrganization(organizationData);
            res.status(201).json(newOrganization);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message, error });
        }
    }

    public async getOrganization(req: Request, res: Response): Promise<void> {
        try {
            const organizationId = req.params.id as string;
            const organization = await this.organizationService.getOrganization(organizationId);
            if (organization) {
                res.status(200).json(organization);
            } else {
                res.status(404).json({ message: 'Organization not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message, error });
        }
    }

    public async updateOrganization(req: Request, res: Response): Promise<void> {
        try {
            const organizationId = req.params.id as string;
            const organizationData = req.body;
            const updatedOrganization = await this.organizationService.updateOrganization(organizationId, organizationData);
            if (updatedOrganization) {
                res.status(200).json(updatedOrganization);
            } else {
                res.status(404).json({ message: 'Organization not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message, error });
        }
    }

    public async deleteOrganization(req: Request, res: Response): Promise<void> {
        try {
            const organizationId = req.params.id as string;
            const deleted = await this.organizationService.deleteOrganization(organizationId);
            if (deleted) {
                res.status(204).send();
            } else {
                res.status(404).json({ message: 'Organization not found' });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message, error });
        }
    }
}