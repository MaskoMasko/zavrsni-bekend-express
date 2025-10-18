require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

/* -------- Helpers postojeći (email/JMBAG/JWT) -------- */
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
  const replaced = s.split('').map(ch => map[ch] || ch).join('');
  return replaced
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

async function generateUniqueStudentEmail(firstName, lastName) {
  const domain = 'student.edu.hr';
  const fi = toAsciiLettersLower(firstName).charAt(0);
  let ln = toAsciiLettersLower(lastName);
  if (!ln) ln = toAsciiLettersLower(firstName); // fallback
  let base = `${fi}${ln}`;
  if (!base) base = 'student';

  let email = `${base}@${domain}`;
  let suffix = 2;
  while (true) {
    const exists = await prisma.student.findUnique({ where: { email } });
    if (!exists) return email;
    email = `${base}${suffix}@${domain}`;
    suffix++;
  }
}

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

function issueJwt(student) {
  const payload = { sub: student.id, email: student.email };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/* -------- Helpers za upise i planiranje ACTIVE -------- */

const yearSemesters = { 1: [1, 2], 2: [3, 4], 3: [5, 6] };
const ODDS = [1, 3, 5];
const EVENS = [2, 4, 6];

function ensureYear(enrolledYear) {
  const y = Number(enrolledYear);
  if (![1, 2, 3].includes(y)) {
    throw new Error('enrolledYear mora biti 1, 2 ili 3');
  }
  return y;
}
function ensureModule(enrolledYear, module) {
  if (enrolledYear === 3) return module || null;
  return null; // samo 3. godina smije imati modul
}

async function getCoursesMaps() {
  const courses = await prisma.course.findMany();
  const coursesBySem = courses.reduce((acc, c) => {
    acc[c.semester] = acc[c.semester] || [];
    acc[c.semester].push(c);
    return acc;
  }, {});
  const coursesById = Object.fromEntries(courses.map(c => [c.id, c]));
  return { courses, coursesBySem, coursesById };
}

async function getStudentHistory(studentId) {
  const enrollments = await prisma.studentCourse.findMany({
    where: { studentId },
    select: {
      courseId: true,
      status: true,
      assignedSemester: true,
    },
  });

  const passedSet = new Set();
  const failedBySem = {}; // sem -> [CourseId]

  for (const e of enrollments) {
    if (e.status === 'PASSED') {
      passedSet.add(e.courseId);
    } else if (e.status === 'FAILED') {
      failedBySem[e.assignedSemester] = failedBySem[e.assignedSemester] || [];
      failedBySem[e.assignedSemester].push(e.courseId);
    }
  }
  return { passedSet, failedBySem };
}

function fillSemesterActivePlan({
  student,
  semester,
  retakeCourseIds,
  newCourseIds,
  passedSet,
  coursesById,
}) {
  const MAX_COUNT = 6;
  const MAX_ECTS = 30;
  let count = 0;
  let ects = 0;

  const plan = []; // { courseId, status:'ACTIVE', assignedSemester, assignedYear }

  const canActivate = (course) => {
    if (passedSet.has(course.id)) return false; // već položen
    if (course.prerequisiteId && !passedSet.has(course.prerequisiteId)) return false; // preduvjet nije položen
    if (count >= MAX_COUNT) return false;
    if (ects + course.ects > MAX_ECTS) return false;
    return true;
  };

  // 1) retake najprije
  for (const cid of retakeCourseIds) {
    const course = coursesById[cid];
    if (!course) continue;
    if (canActivate(course)) {
      plan.push({
        courseId: course.id,
        status: 'ACTIVE',
        assignedSemester: semester,
        assignedYear: student.enrolledYear,
      });
      count += 1;
      ects += course.ects;
    }
  }

  // 2) novi kolegiji semestra
  for (const cid of newCourseIds) {
    const course = coursesById[cid];
    if (!course) continue;
    if (canActivate(course)) {
      plan.push({
        courseId: course.id,
        status: 'ACTIVE',
        assignedSemester: semester,
        assignedYear: student.enrolledYear,
      });
      count += 1;
      ects += course.ects;
    }
  }

  return plan;
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

app.get('/students/:id', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
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
    if (!student) return res.status(404).json({ error: 'Student nije pronađen' });

    const enrollments = await prisma.studentCourse.findMany({
      where: { studentId },
      include: { course: { select: { id: true, name: true, ects: true, semester: true, year: true } } },
      orderBy: [{ assignedSemester: 'asc' }, { id: 'asc' }],
    });

    const grouped = { ACTIVE: [], PASSED: [], FAILED: [] };
    for (const e of enrollments) {
      grouped[e.status] = grouped[e.status] || [];
      grouped[e.status].push({
        enrollmentId: e.id,
        courseId: e.course.id,
        name: e.course.name,
        ects: e.course.ects,
        semester: e.course.semester,
        year: e.course.year,
        assignedSemester: e.assignedSemester,
        assignedYear: e.assignedYear,
      });
    }

    res.json({ student, enrollments: grouped });
  } catch (err) {
    console.error('Greška pri dohvaćanju studenta:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

/* -------- Novi endpoint: PATCH /students/:id (update + dodjela predmeta) -------- */
app.patch('/students/:id', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }

  try {
    const existing = await prisma.student.findUnique({ where: { id: studentId } });
    if (!existing) return res.status(404).json({ error: 'Student nije pronađen' });

    // Ulaz
    let { enrolledYear, repeatingYear, module } = req.body || {};
    if (enrolledYear !== undefined) enrolledYear = ensureYear(enrolledYear);
    if (repeatingYear !== undefined) repeatingYear = Boolean(repeatingYear);
    const nextYear = enrolledYear ?? existing.enrolledYear;
    const nextRepeat = repeatingYear ?? existing.repeatingYear;
    const nextModule = ensureModule(nextYear, module ?? existing.module);

    // Transakcija: update + brisanje starih ACTIVE + dodjela novih ACTIVE
    const result = await prisma.$transaction(async (tx) => {
      // 1) Update studenta
      const updated = await tx.student.update({
        where: { id: studentId },
        data: {
          enrolledYear: nextYear,
          repeatingYear: nextRepeat,
          module: nextModule,
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

      // 2) Priprema: mape kolegija i povijest studenta
      const { courses, coursesBySem, coursesById } = await getCoursesMaps();
      const { passedSet, failedBySem } = await getStudentHistory(studentId);

      // 3) Odredi semestre trenutne godine
      const [semOdd, semEven] = yearSemesters[updated.enrolledYear];

      // 4) Očisti postojeće ACTIVE za semOdd i semEven (prije nove dodjele)
      await tx.studentCourse.deleteMany({
        where: {
          studentId,
          status: 'ACTIVE',
          assignedSemester: { in: [semOdd, semEven] },
        },
      });

      // 5) Retake kandidati: svi FAIL iz prijašnjih semestara iste parnosti
      const priorOdds = ODDS.filter(s => s < semOdd);
      const priorEvens = EVENS.filter(s => s < semEven);

      const retakeOddIds = [
        ...priorOdds.flatMap(s => failedBySem[s] || []),
        ...(updated.repeatingYear ? (failedBySem[semOdd] || []) : []),
      ];
      const retakeEvenIds = [
        ...priorEvens.flatMap(s => failedBySem[s] || []),
        ...(updated.repeatingYear ? (failedBySem[semEven] || []) : []),
      ];

      // 6) Novi kolegiji: svi iz semestra tekuće godine
      const newOddIds = (coursesBySem[semOdd] || []).map(c => c.id);
      const newEvenIds = (coursesBySem[semEven] || []).map(c => c.id);

      // 7) Izgradi plan ACTIVE po semestru, uz limite i preduvjete
      const planOdd = fillSemesterActivePlan({
        student: updated,
        semester: semOdd,
        retakeCourseIds: retakeOddIds,
        newCourseIds: newOddIds,
        passedSet,
        coursesById,
      });
      const planEven = fillSemesterActivePlan({
        student: updated,
        semester: semEven,
        retakeCourseIds: retakeEvenIds,
        newCourseIds: newEvenIds,
        passedSet,
        coursesById,
      });

      const toCreate = [...planOdd, ...planEven].map(p => ({
        studentId: updated.id,
        courseId: p.courseId,
        status: p.status,
        assignedYear: updated.enrolledYear,
        assignedSemester: p.assignedSemester,
      }));

      if (toCreate.length) {
        await tx.studentCourse.createMany({ data: toCreate });
      }

      // 8) Vratimo sažetak
      const activeSummary = {
        [semOdd]: {
          count: planOdd.length,
          ects: planOdd.reduce((sum, p) => sum + (coursesById[p.courseId]?.ects || 0), 0),
        },
        [semEven]: {
          count: planEven.length,
          ects: planEven.reduce((sum, p) => sum + (coursesById[p.courseId]?.ects || 0), 0),
        },
      };

      return { updated, assignedActive: { odd: planOdd, even: planEven }, activeSummary };
    });

    res.json(result);
  } catch (err) {
    console.error('Greška pri ažuriranju studenta:', err);
    if (err?.message?.includes('enrolledYear')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server sluša na portu ${PORT}`);
});