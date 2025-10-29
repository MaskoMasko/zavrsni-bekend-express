const request = require('supertest');
const app = require('../src/index')
const { prisma } = require('./setup');

describe('Auth Routes', () => {
    beforeEach(async () => {
        await prisma.student.deleteMany();
    });

    describe('POST /register', () => {
        it('should register a new student', async () => {
            const studentData = {
                firstName: 'Test',
                lastName: 'Student',
                password: 'Test123!'
            };

            const response = await request(app)
                .post('/auth/register')
                .send(studentData)
                .expect(201);

            expect(response.body).toHaveProperty('user');
        });

        it('should return error for missing fields', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({ firstName: 'Test' })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('POST /auth/login', () => {
        beforeEach(async () => {
            await request(app)
                .post('/auth/register')
                .send({
                    firstName: 'Login',
                    lastName: 'Test',
                    password: 'Test123!'
                });
        });

        it('should return error for invalid credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'ltest1@student.edu.hr',
                    password: 'WrongPassword'
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });
});