const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('./setup');

describe('Students Routes', () => {
    let authToken;
    let testStudent;

    beforeAll(async () => {
        const registerResponse = await request(app)
            .post('/auth/register')
            .send({
                firstName: 'Api',
                lastName: 'Test',
                password: 'Test123!'
            });

        testStudent = registerResponse.body.user;

        const loginResponse = await request(app)
            .post('/auth/login')
            .send({
                email: 'atest1@student.edu.hr',
                password: 'Test123!'
            });

        authToken = loginResponse.body.token;
    });

    describe('GET /students', () => {
        it('should return all students', async () => {
            const response = await request(app)
                .get('/students')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
        });

        it('should return student details by ID', async () => {
            const response = await request(app)
                .get(`/students/${testStudent.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('student');
        });

        it('should return 404 for non-existent student', async () => {
            await request(app)
                .get('/students/9999')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);
        });
    });

    describe('PATCH /students/:id', () => {
        it('should update student year and module', async () => {
            const updateData = {
                enrolledYear: 2,
                module: 'RPP',
                repeatingYear: false
            };

            const response = await request(app)
                .patch(`/students/${testStudent.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.updated.enrolledYear).toBe(2);
        });
    });
});