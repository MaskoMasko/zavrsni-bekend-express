const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('./setup');

describe('Documents Routes', () => {
    let authToken;
    let testStudent;

    beforeAll(async () => {
        const registerResponse = await request(app)
            .post('/auth/register')
            .send({
                firstName: 'Documents',
                lastName: 'Test',
                password: 'Test123!'
            });

        testStudent = registerResponse.body.user;

        const loginResponse = await request(app)
            .post('/auth/login')
            .send({
                email: 'dtest1@student.edu.hr',
                password: 'Test123!'
            });

        authToken = loginResponse.body.token;
    });

    describe('GET /students/:id/study-confirmation', () => {
        it('should generate study confirmation PDF', async () => {
            const response = await request(app)
                .get(`/students/${testStudent.id}/study-confirmation`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.headers['content-type']).toBe('application/pdf');
            expect(response.headers['content-disposition']).toContain('potvrda_o_studiranju');
        });
    });

    describe('GET /students/:id/transcript', () => {
        it('should generate transcript PDF', async () => {
            const response = await request(app)
                .get(`/students/${testStudent.id}/transcript`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.headers['content-type']).toBe('application/pdf');
            expect(response.headers['content-disposition']).toContain('transkript');
        });
    });
});