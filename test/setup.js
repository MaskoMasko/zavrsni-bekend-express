const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

beforeAll(async () => {
    // Očisti bazu prije testova
    await prisma.studentCourse.deleteMany();
    await prisma.studentDocument.deleteMany();
    await prisma.student.deleteMany();
    await prisma.course.deleteMany();
});

afterAll(async () => {
    await prisma.$disconnect();
});

module.exports = { prisma };