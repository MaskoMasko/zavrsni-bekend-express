/* src/server.js */
require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Helper: ukloni dijakritike i neželjene znakove, sve u lowercase
function toAsciiLettersLower(s) {
  if (!s) return '';
  const map = {
    č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'd',
    Č: 'c', Ć: 'c', Ž: 'z', Š: 's', Đ: 'd',
    ä: 'a', ö: 'o', ü: 'u', Ä: 'a', Ö: 'o', Ü: 'u',
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
    à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u',
    ñ: 'n', Ñ: 'n', ß: 'ss',
  };
  const replaced = s
    .split('')
    .map(ch => map[ch] || ch)
    .join('');
  return replaced
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, ''); // samo [a-z]
}

// Helper: generiraj e-mail iz imena i prezimena, rješavaj kolizije dodavanjem sufiksa
async function generateUniqueStudentEmail(firstName, lastName) {
  const domain = 'student.edu.hr';
  const fi = toAsciiLettersLower(firstName).charAt(0);
  let ln = toAsciiLettersLower(lastName);
  if (!ln) ln = toAsciiLettersLower(firstName); // fallback
  let base = `${fi}${ln}`;
  if (!base) base = 'student';

  let email = `${base}@${domain}`;
  let suffix = 2;
  // Provjeri kolizije i dodaj broj ako treba
  while (true) {
    const exists = await prisma.student.findUnique({ where: { email } });
    if (!exists) return email;
    email = `${base}${suffix}@${domain}`;
    suffix++;
  }
}

// Helper: generiraj jedinstveni JMBAG (10 znamenki)
function generateJmbag() {
  let s = '';
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}
async function generateUniqueJmbag() {
  while (true) {
    const candidate = generateJmbag();
    const exists = await prisma.student.findUnique({ where: { jmbag: candidate } });
    if (!exists) return candidate;
  }
}

// Helper: JWT izdavanje
function issueJwt(student) {
  // Minimalni payload
  const payload = {
    sub: student.id,
    email: student.email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

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

// GET /students/:id/courses - dohvat upisa studenta (ako već imaš ovaj endpoint u kodu, ostavi ga)
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
      grouped[e.status] = grouped[e.status] || [];
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

/* AUTH ENDPOINTI */

// POST /auth/register
// body: { firstName, lastName, password }
// email se automatski generira: inicijal imena + prezime + '@student.edu.hr'
// enrolledYear = 1, repeatingYear = false, module = null
app.post('/auth/register', async (req, res) => {
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

    const student = await prisma.student.create({
      data: {
        jmbag,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: email.toLowerCase(),
        passwordHash,
        enrolledYear: 1,
        repeatingYear: false,
        module: null,
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
        createdAt: true,
        updatedAt: true,
      },
    });

    const token = issueJwt(student);

    res.status(201).json({ user: student, token });
  } catch (err) {
    console.error('Greška pri registraciji:', err);
    // Unique email/jmbag collision fallback
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Email ili JMBAG već postoji' });
    }
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// POST /auth/login
// body: { email, password }  (email mora biti iz @student.edu.hr domene)
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email i password su obavezni' });
    }
    const normEmail = String(email).toLowerCase().trim();
    if (!normEmail.endsWith('@student.edu.hr')) {
      return res.status(400).json({ error: 'Email mora biti u domeni @student.edu.hr' });
    }

    const student = await prisma.student.findUnique({ where: { email: normEmail } });
    if (!student) {
      return res.status(401).json({ error: 'Neispravan email ili lozinka' });
    }

    const ok = await bcrypt.compare(String(password), student.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Neispravan email ili lozinka' });
    }

    const token = issueJwt(student);
    // sanitiziraj user objekt
    const user = {
      id: student.id,
      jmbag: student.jmbag,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      enrolledYear: student.enrolledYear,
      repeatingYear: student.repeatingYear,
      module: student.module,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    };

    res.json({ user, token });
  } catch (err) {
    console.error('Greška pri prijavi:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server sluša na portu ${PORT}`);
});