const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const { generateUniqueStudentEmail, generateUniqueJmbag, issueJwt } = require('../helpers/utils');

const router = express.Router();

// POST /auth/register
router.post('/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body || {};
    if (!firstName || !lastName || !password) {
      return res.status(400).json({ error: 'firstName, lastName i password su obavezni' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Lozinka mora imati barem 8 znakova' });
    }

    const email = await generateUniqueStudentEmail(firstName, lastName);
    const jmbag = await generateUniqueJmbag();
    const passwordHash = await bcrypt.hash(String(password), 10);

    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          jmbag,
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          email: email.toLowerCase(),
          passwordHash,
          enrolledYear: 1,
          repeatingYear: false,
          module: null,
          enrollmentStep: 3,
          enrollmentYearSelected: true,
          enrollmentCoursesSelected: true,
          enrollmentDocumentsSubmitted: true,
          enrollmentCompleted: true,
        },
        select: {
          id: true,
          jmbag: true,
          firstName: true,
          lastName: true,
          email: true,
          enrolledYear: true,
          repeatingYear: true,
          module: true,
          enrollmentStep: true,
          enrollmentYearSelected: true,
          enrollmentCoursesSelected: true,
          enrollmentDocumentsSubmitted: true,
          enrollmentCompleted: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const year1Courses = await tx.course.findMany({
        where: { year: 1 },
        select: { id: true, semester: true },
      });

      if (year1Courses.length > 0) {
        const activeRows = year1Courses.map((c) => ({
          studentId: student.id,
          courseId: c.id,
          status: 'ACTIVE',
          assignedYear: 1,
          assignedSemester: c.semester, // 1 ili 2
        }));
        await tx.studentCourse.createMany({ data: activeRows });
      }

      return { student };
    });

    const token = issueJwt(result.student);
    res.status(201).json({ user: result.student, token });
  } catch (err) {
    console.error('Greška pri registraciji:', err);
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Email ili JMBAG već postoji' });
    }
    res.status(500).json({ error: 'Interna greška servera' });
  }
});;

// POST /auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email i password su obavezni' });
    }
    const normEmail = String(email).toLowerCase().trim();
    if (!normEmail.endsWith('@student.edu.hr')) {
      return res.status(400).json({ error: 'Email mora biti u domeni @student.edu.hr' });
    }

    const student = await prisma.student.findUnique({
      where: { email: normEmail },
      select: {
        id: true, enrollmentCompleted: true, enrollmentCoursesSelected: true, enrollmentYearSelected: true,
        enrollmentDocumentsSubmitted: true, enrollmentStep: true, repeatingYear: true, enrolledYear: true,
        email: true, module: true, lastName: true, jmbag: true, firstName: true, documents: true, passwordHash: true,
      },
    });
    if (!student) {
      return res.status(401).json({ error: 'Neispravan email ili lozinka' });
    }

    const ok = await bcrypt.compare(String(password), student.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Neispravan email ili lozinka' });
    }

    const token = issueJwt(student);
    res.json({ user: student, token });
  } catch (err) {
    console.error('Greška pri prijavi:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

module.exports = router;