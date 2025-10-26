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
                .post('/register')
                .send(studentData)
                .expect(201);

            expect(response.body).toHaveProperty('student');
            expect(response.body.student.firstName).toBe('Test');
            expect(response.body.student.lastName).toBe('Student');
            expect(response.body.student.jmbag).toMatch(/^\d{10}$/);
            expect(response.body.student.email).toContain('@student.edu.hr');
        });

        it('should return error for missing fields', async () => {
            const response = await request(app)
                .post('/register')
                .send({ firstName: 'Test' })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('POST /login', () => {
        beforeEach(async () => {
            // Kreiraj testnog studenta za login
            await request(app)
                .post('/register')
                .send({
                    firstName: 'Login',
                    lastName: 'Test',
                    password: 'Test123!'
                });
        });

        it('should login successfully with correct credentials', async () => {
            const response = await request(app)
                .post('/login')
                .send({
                    email: 'ltest1@student.edu.hr',
                    password: 'Test123!'
                })
                .expect(200);

            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('user');
        });

        it('should return error for invalid credentials', async () => {
            const response = await request(app)
                .post('/login')
                .send({
                    email: 'ltest1@student.edu.hr',
                    password: 'WrongPassword'
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });
});