const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/courses', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            year,
            semester,
            search,
            includePrerequisites = false,
            sortBy = 'name',
            sortOrder = 'asc'
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const where = {};

        if (year) {
            where.year = parseInt(year);
        }

        if (semester) {
            where.semester = parseInt(semester);
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { holder: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        const orderBy = {};
        const validSortFields = ['name', 'year', 'semester', 'ects', 'capacity', 'createdAt'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
        orderBy[sortField] = sortOrder === 'desc' ? 'desc' : 'asc';

        const include = {
            prerequisite: includePrerequisites === 'true' ? {
                select: {
                    id: true,
                    name: true,
                    semester: true,
                    year: true
                }
            } : false,
            _count: {
                select: {
                    enrollments: true
                }
            }
        };

        const [courses, totalCount] = await Promise.all([
            prisma.course.findMany({
                where,
                include,
                orderBy,
                skip,
                take: limitNum
            }),
            prisma.course.count({ where })
        ]);

        const totalPages = Math.ceil(totalCount / limitNum);

        res.json({
            data: courses,
            pagination: {
                page: pageNum,
                limit: limitNum,
                totalCount,
                totalPages,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1
            }
        });

    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({
            error: 'Internal server error while fetching courses'
        });
    }
});

// POST /api/courses - Create a new course
router.post('/courses', async (req, res) => {
    try {
        const {
            name,
            holder,
            holderEmail,
            assistant,
            assistantEmail,
            description,
            ects,
            semester,
            year,
            capacity,
            prerequisiteId
        } = req.body;

        if (!name || !holder || !description || !ects || !semester || !year) {
            return res.status(400).json({
                error: 'Missing required fields: name, holder, description, ects, semester, year'
            });
        }

        const existingCourse = await prisma.course.findUnique({
            where: { name }
        });

        if (existingCourse) {
            return res.status(409).json({
                error: 'Course with this name already exists'
            });
        }

        if (prerequisiteId) {
            const prerequisite = await prisma.course.findUnique({
                where: { id: prerequisiteId }
            });

            if (!prerequisite) {
                return res.status(400).json({
                    error: 'Prerequisite course not found'
                });
            }
        }

        const newCourse = await prisma.course.create({
            data: {
                name,
                holder,
                holderEmail: holderEmail || null,
                assistant: assistant || null,
                assistantEmail: assistantEmail || null,
                description,
                ects: parseInt(ects),
                semester: parseInt(semester),
                year: parseInt(year),
                capacity: capacity ? parseInt(capacity) : 30,
                prerequisiteId: prerequisiteId || null
            },
            include: {
                prerequisite: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        res.status(201).json({
            message: 'Course created successfully',
            course: newCourse
        });

    } catch (error) {
        console.error('Error creating course:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

module.exports = router;