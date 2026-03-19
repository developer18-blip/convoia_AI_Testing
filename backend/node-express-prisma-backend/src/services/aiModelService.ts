import { PrismaClient } from '@prisma/client';

export class AIModelService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    async createModel(data: any) {
        return await this.prisma.aIModel.create({
            data,
        });
    }

    async getModel(id: string) {
        return await this.prisma.aIModel.findUnique({
            where: { id },
        });
    }

    async updateModel(id: string, data: any) {
        return await this.prisma.aIModel.update({
            where: { id },
            data,
        });
    }

    async deleteModel(id: string) {
        return await this.prisma.aIModel.delete({
            where: { id },
        });
    }

    async getAllModels() {
        return await this.prisma.aIModel.findMany();
    }
}