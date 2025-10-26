const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('./setup');

describe('Enrollment Routes', () => {
    let authToken;
    let testStudent;
    let testCourse;

    beforeAll(async () => {
        const registerResponse = await request(app)
            .post('/register')
            .send({
                firstName: 'Enrollment',
                lastName: 'Test',
                password: 'Test123!'
            });

        testStudent = registerResponse.body.student;

        const loginResponse = await request(app)
            .post('/login')
            .send({
                email: 'etest1@student.edu.hr',
                password: 'Test123!'
            });

        authToken = loginResponse.body.token;

        testCourse = await prisma.course.create({
            data: {
                name: 'Test Course',
                ects: 5,
                year: 1,
                semester: 1
            }
        });
    });

    describe('PATCH /students/:id/enrollment/courses', () => {
        it('should enroll student in courses', async () => {
            const enrollmentData = {
                winterCourseNames: ['Test Course'],
                summerCourseNames: []
            };

            const response = await request(app)
                .patch(`/students/${testStudent.id}/enrollment/courses`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(enrollmentData)
                .expect(200);

            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('active');
        });

        it('should return error for non-existent course', async () => {
            const enrollmentData = {
                winterCourseNames: ['Non Existent Course'],
                summerCourseNames: []
            };

            const response = await request(app)
                .patch(`/students/${testStudent.id}/enrollment/courses`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(enrollmentData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /students/:id/enrollment/active-courses', () => {
        it('should return active courses for student', async () => {
            const response = await request(app)
                .get(`/students/${testStudent.id}/enrollment/active-courses`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('active');
            expect(response.body).toHaveProperty('currentYearSemesters');
        });
    });
});