import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class OrganizationService {
    async createOrganization(data: { name: string; email: string; ownerId: string; phone?: string; website?: string; logo?: string }) {
        return await prisma.organization.create({
            data,
        });
    }

    async getOrganization(id: string) {
        return await prisma.organization.findUnique({
            where: { id },
        });
    }

    async updateOrganization(id: string, data: { name?: string; email?: string; phone?: string; website?: string; logo?: string; tier?: string; status?: string }) {
        return await prisma.organization.update({
            where: { id },
            data,
        });
    }

    async deleteOrganization(id: string) {
        return await prisma.organization.delete({
            where: { id },
        });
    }

    async getAllOrganizations() {
        return await prisma.organization.findMany();
    }
}