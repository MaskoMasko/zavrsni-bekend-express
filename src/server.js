/* src/server.js */
require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

// GET /students - dohvat svih studenata (bez passwordHash)
app.get('/students', async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      select: {
        id: true,
        jmbag: true,
        firstName: true,
        lastName: true,
        email: true,
        enrolledYear: true,
        repeatingYear: true,
        module: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    });
    res.json(students);
  } catch (err) {
    console.error('Greška pri dohvatu studenata:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// GET /courses - dohvat svih kolegija s preduvjetom (ako postoji)
app.get('/courses', async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      select: {
        id: true,
        name: true,
        holder: true,
        description: true,
        ects: true,
        semester: true,
        year: true,
        prerequisite: {
          select: {
            id: true,
            name: true,
            semester: true,
            year: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { year: 'asc' },
        { semester: 'asc' },
        { name: 'asc' },
      ],
    });
    res.json(courses);
  } catch (err) {
    console.error('Greška pri dohvatu kolegija:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// GET /students/:id/courses - dohvat upisa studenta, grupirano po statusu + sažeci po semestru
app.get('/students/:id/courses', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) return res.status(400).json({ error: 'Neispravan studentId' });

  try {
    const enrollments = await prisma.studentCourse.findMany({
      where: { studentId },
      include: {
        course: { select: { id: true, name: true, ects: true, semester: true, year: true, prerequisiteId: true } },
      },
      orderBy: [{ assignedSemester: 'asc' }, { status: 'asc' }, { id: 'asc' }],
    });

    const grouped = { ACTIVE: [], PASSED: [], FAILED: [] };
    const semesterLoad = {}; // { sem: { activeCount, activeEcts } }

    for (const e of enrollments) {
      grouped[e.status].push({
        enrollmentId: e.id,
        courseId: e.course.id,
        name: e.course.name,
        ects: e.course.ects,
        courseSemester: e.course.semester,
        courseYear: e.course.year,
        assignedSemester: e.assignedSemester,
        assignedYear: e.assignedYear,
        prerequisiteId: e.course.prerequisiteId,
      });

      if (e.status === 'ACTIVE') {
        const sem = e.assignedSemester;
        if (!semesterLoad[sem]) semesterLoad[sem] = { activeCount: 0, activeEcts: 0 };
        semesterLoad[sem].activeCount += 1;
        semesterLoad[sem].activeEcts += e.course.ects;
      }
    }

    res.json({ studentId, grouped, semesterLoad });
  } catch (err) {
    console.error('Greška pri dohvatu upisa studenta:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server sluša na portu ${PORT}`);
});