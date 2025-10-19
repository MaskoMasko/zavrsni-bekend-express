require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const PDFDocument = require('pdfkit');

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

const yearSemesters = { 1: [1, 2], 2: [3, 4], 3: [5, 6] };

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// Posluži uploadane datoteke (opcionalno)
app.use('/uploads', express.static(UPLOAD_ROOT));

// Dozvoljeni tipovi dokumenata
const ALLOWED_DOC_TYPES = new Set(['upisniObrazac', 'uplatnica', 'potvrdaUplatnice']);

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


// GET /students/leaderboard?year=1|2|3
// Stara logika + moduleCapacities { max, current } po modulu
app.get('/students/leaderboard', async (req, res) => {
    const yearParam = Number(req.query.year);
    if (![1, 2, 3].includes(yearParam)) {
        return res.status(400).json({ error: 'Parametar year mora biti 1, 2 ili 3' });
    }

    // Stabilan kapacitet 25..40 po modulu; UNASSIGNED ima 0
    function getModuleCapacity(modKey) {
        if (!modKey || modKey === 'UNASSIGNED') return 0;
        const s = String(modKey).toUpperCase();
        let sum = 0;
        for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
        // 25..40 uključivo
        return 25 + (sum % 16);
    }

    try {
        const students = await prisma.student.findMany({
            where: {
                enrolledYear: yearParam,
                // enrollmentCompleted: true, // ne diramo staru logiku; ovo je bilo zakomentirano i ostaje tako
            },
            select: {
                id: true, jmbag: true, firstName: true, lastName: true, email: true,
                enrolledYear: true, repeatingYear: true, module: true,
                enrollmentCompleted: true, createdAt: true, updatedAt: true,
            },
        });

        if (!students.length) {
            return res.json({ year: yearParam, totalStudents: 0, moduleCapacities: {}, groups: {} });
        }

        const studentIds = students.map(s => s.id);

        const enrollments = await prisma.studentCourse.findMany({
            where: { studentId: { in: studentIds } },
            select: { studentId: true, status: true, course: { select: { ects: true } } },
        });

        const ectsByStudent = new Map();
        for (const e of enrollments) {
            if (e.status === 'PASSED') {
                ectsByStudent.set(
                    e.studentId,
                    (ectsByStudent.get(e.studentId) || 0) + (e.course?.ects || 0)
                );
            }
        }

        // Grupiranje po modulu (null -> UNASSIGNED) i rangiranje
        const groups = {};
        for (const s of students) {
            const key = s.module || 'UNASSIGNED';
            const totalEcts = ectsByStudent.get(s.id) || 0;
            const entry = {
                id: s.id, jmbag: s.jmbag, firstName: s.firstName, lastName: s.lastName,
                email: s.email, enrolledYear: s.enrolledYear, repeatingYear: s.repeatingYear,
                module: s.module, enrollmentCompleted: s.enrollmentCompleted,
                stats: { ectsPassedTotal: totalEcts },
                createdAt: s.createdAt, updatedAt: s.updatedAt,
            };
            if (!groups[key]) groups[key] = [];
            groups[key].push(entry);
        }

        for (const key of Object.keys(groups)) {
            groups[key].sort((a, b) =>
                b.stats.ectsPassedTotal - a.stats.ectsPassedTotal || a.lastName.localeCompare(b.lastName)
            );
        }

        // Kapaciteti po modulu: max i current
        const moduleCapacities = {};
        for (const key of Object.keys(groups)) {
            const max = getModuleCapacity(key);
            const current = groups[key].length;
            moduleCapacities[key] = { max, current };
        }

        res.json({
            year: yearParam,
            totalStudents: students.length,
            moduleCapacities, // NOVO: { [moduleKey]: { max, current } }
            groups,           // ne diramo stari payload
        });
    } catch (err) {
        console.error('Greška /students/leaderboard:', err);
        res.status(500).json({ error: 'Interna greška servera' });
    }
});
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
app.get('/students/:id/courses', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }

  // helperi
  const isWinterSem = (sem) => [1, 3, 5].includes(sem);
  const isSummerSem = (sem) => [2, 4, 6].includes(sem);
  const ensureYearSimple = (y) => {
    const yy = Number(y);
    if (![1, 2, 3].includes(yy)) throw new Error('year mora biti 1, 2 ili 3');
    return yy;
  };

  try {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Student nije pronađen' });

    // Odredi ciljanu godinu:
    // - ako je zadana u query parametru ?year=, koristi nju
    // - inače koristi student.enrolledYear
    let targetYear = student.enrolledYear;
    if (req.query?.year !== undefined) {
      try {
        targetYear = ensureYearSimple(req.query.year);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    // Dohvati sve kolegije i sve upise studenta
    const [courses, enrollments] = await Promise.all([
      prisma.course.findMany({
        select: {
          id: true,
          name: true,
          ects: true,
          semester: true,
          year: true,
          prerequisiteId: true,
        },
      }),
      prisma.studentCourse.findMany({
        where: { studentId },
        include: {
          course: {
            select: { id: true, name: true, ects: true, semester: true, year: true, prerequisiteId: true },
          },
        },
      }),
    ]);

    // Skupovi za brzu provjeru
    const failedSet = new Set(
      enrollments.filter(e => e.status === 'FAILED').map(e => e.courseId)
    );
    const enrolledCourseIds = new Set(
      enrollments.map(e => e.courseId) // bilo PASSED/FAILED/ACTIVE
    );

    // FAILED podijeljeni na zimski/ljetni po semestru kolegija
    const winterFailedMap = new Map(); // courseId -> course
    const summerFailedMap = new Map();
    for (const e of enrollments) {
      if (e.status !== 'FAILED') continue;
      const c = e.course;
      if (isWinterSem(c.semester)) {
        winterFailedMap.set(c.id, c);
      } else if (isSummerSem(c.semester)) {
        summerFailedMap.set(c.id, c);
      }
    }

    const failedCourses = {
      winter: Array.from(winterFailedMap.values()).map(c => ({
        id: c.id,
        name: c.name,
        ects: c.ects,
        semester: c.semester,
        year: c.year,
        prerequisiteId: c.prerequisiteId,
      })),
      summer: Array.from(summerFailedMap.values()).map(c => ({
        id: c.id,
        name: c.name,
        ects: c.ects,
        semester: c.semester,
        year: c.year,
        prerequisiteId: c.prerequisiteId,
      })),
    };

    // Available:
    // - svi kolegiji na ciljanoj godini
    // - filter: bez preduvjeta ili preduvjet nije u failedSet
    const targetYearCourses = courses.filter(c => c.year === targetYear);
    const availableTargetYear = targetYearCourses.filter(c => {
      return !c.prerequisiteId || !failedSet.has(c.prerequisiteId);
    });

    // + kolegiji s 1. godine koje student uopće nema u upisima (nije PASSED/FAILED/ACTIVE)
    const missingYear1 = targetYear >= 2
      ? courses.filter(c => c.year === 1 && !enrolledCourseIds.has(c.id))
      : [];

    // Sastavi finalnu listu dostupnih (uniq po id)
    const availableMap = new Map();
    for (const c of availableTargetYear) availableMap.set(c.id, c);
    for (const c of missingYear1) availableMap.set(c.id, c);

    const availableCourses = {
      year: targetYear,
      courses: Array.from(availableMap.values())
        .sort((a, b) => a.semester - b.semester || a.name.localeCompare(b.name))
        .map(c => ({
          id: c.id,
          name: c.name,
          ects: c.ects,
          semester: c.semester,
          year: c.year,
          prerequisiteId: c.prerequisiteId,
          prerequisiteBlocked: !!c.prerequisiteId && failedSet.has(c.prerequisiteId),
        })),
    };

    res.json({
      studentId,
      targetYear,
      failedCourses,
      availableCourses,
    });
  } catch (err) {
    console.error('Greška /students/:id/courses:', err);
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
        enrollingThisYear: true, // novi student se upisuje u tekuću godinu
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
        enrollingThisYear: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const token = issueJwt(student);
    res.status(201).json({ user: student, token });
  } catch (err) {
    console.error('Greška pri registraciji:', err);
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Email ili JMBAG već postoji' });
    }
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

app.get('/students/:id/enrollment/active-courses', async (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
        return res.status(400).json({ error: 'Neispravan studentId' });
    }

    // mapiranje godina -> semestri tekuće godine
    const yearSemesters = { 1: [1, 2], 2: [3, 4], 3: [5, 6] };

    try {
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                enrolledYear: true,
                module: true,
                enrollmentStep: true,
                enrollmentYearSelected: true,
                enrollmentCoursesSelected: true,
                enrollmentDocumentsSubmitted: true,
                enrollmentCompleted: true,
                updatedAt: true,
            },
        });

        if (!student) {
            return res.status(404).json({ error: 'Student nije pronađen' });
        }

        const [semOdd, semEven] = yearSemesters[student.enrolledYear];

        // Dohvati ACTIVE upise u semestrima tekuće godine
        const activeEnrollments = await prisma.studentCourse.findMany({
            where: {
                studentId,
                status: 'ACTIVE',
                assignedSemester: { in: [semOdd, semEven] },
            },
            include: {
                course: {
                    select: {
                        id: true,
                        name: true,
                        ects: true,
                        semester: true,
                        year: true,
                        prerequisiteId: true,
                    },
                },
            },
            orderBy: [{ assignedSemester: 'asc' }, { id: 'asc' }],
        });

        // Grupiraj u dvije sekcije: zimski/ljetni (po assignedSemester za tekuću godinu)
        const winter = [];
        const summer = [];
        for (const e of activeEnrollments) {
            const item = {
                enrollmentId: e.id,
                courseId: e.course.id,
                name: e.course.name,
                ects: e.course.ects,
                originalSemester: e.course.semester, // izvorni semestar kolegija
                originalYear: e.course.year,
                assignedSemester: e.assignedSemester, // semestar tekuće godine (npr. 3 ili 4)
                assignedYear: e.assignedYear,
                prerequisiteId: e.course.prerequisiteId,
            };
            if (e.assignedSemester === semOdd) {
                winter.push(item);
            } else if (e.assignedSemester === semEven) {
                summer.push(item);
            }
        }

        const sumEcts = (arr) => arr.reduce((acc, c) => acc + (c.ects || 0), 0);

        return res.json({
            currentYearSemesters: { odd: semOdd, even: semEven },
            active: {
                winter: {
                    count: winter.length,
                    ects: sumEcts(winter),
                    courses: winter,
                },
                summer: {
                    count: summer.length,
                    ects: sumEcts(summer),
                    courses: summer,
                },
            },
        });
    } catch (err) {
        console.error('GET /students/:id/enrollment/active-courses error:', err);
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

    let { enrolledYear, repeatingYear, module } = req.body || {};
    if (enrolledYear !== undefined) enrolledYear = ensureYear(enrolledYear);
    if (repeatingYear !== undefined) repeatingYear = Boolean(repeatingYear);
    const nextYear = enrolledYear ?? existing.enrolledYear;
    const nextRepeat = repeatingYear ?? existing.repeatingYear;
    const nextModule = ensureModule(nextYear, module ?? existing.module);

    const [semOdd, semEven] = yearSemesters[nextYear];

    // Transakcija: update studenta, očisti ACTIVE u semestrima nove godine, resetiraj korake 2 i 3
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.student.update({
        where: { id: studentId },
        data: {
          enrolledYear: nextYear,
          repeatingYear: nextRepeat,
          module: nextModule,
          // Korak 1 završen; resetiraj ostale korake i završno stanje
          enrollmentYearSelected: true,
          enrollmentCoursesSelected: false,
          enrollmentDocumentsSubmitted: false,
          enrollmentCompleted: false,
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
          enrollmentYearSelected: true,
          enrollmentCoursesSelected: true,
          enrollmentDocumentsSubmitted: true,
          enrollmentCompleted: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Očisti postojeće ACTIVE iz semestara nove godine (da ne ostanu stari odabiri)
      await tx.studentCourse.deleteMany({
        where: {
          studentId,
          status: 'ACTIVE',
          assignedSemester: { in: [semOdd, semEven] },
        },
      });

      return upd;
    });

    res.json({ updated, message: 'Korak 1 završen. ACTIVE predmeti su resetirani za novu godinu.' });
  } catch (err) {
    console.error('PATCH /students/:id error:', err);
    if (err?.message?.includes('enrolledYear')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const studentId = String(req.params.id || 'unknown');
    const dir = path.join(UPLOAD_ROOT, studentId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const type = String(req.params.type);
    const stamp = Date.now();
    cb(null, `${type}-${stamp}.pdf`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Dozvoljeni su samo PDF dokumenti'));
    }
    cb(null, true);
  },
});

// Helper: provjera studenta i tipa dokumenta
async function ensureStudentAndType(req, res) {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    res.status(400).json({ error: 'Neispravan studentId' });
    return null;
  }
  const type = String(req.params.type || '');
  if (!ALLOWED_DOC_TYPES.has(type)) {
    res.status(400).json({ error: 'Nepodržan tip dokumenta' });
    return null;
  }
  const exists = await prisma.student.findUnique({ where: { id: studentId } });
  if (!exists) {
    res.status(404).json({ error: 'Student nije pronađen' });
    return null;
  }
  return { studentId, type };
}

/* ============ 1) Download mock PDF-a ============ */
// GET /documents/templates/:type  -> generira mock PDF i šalje kao attachment
app.get('/documents/templates/:type', async (req, res) => {
  const type = String(req.params.type || '');
  if (!ALLOWED_DOC_TYPES.has(type)) {
    return res.status(400).json({ error: 'Nepodržan tip dokumenta' });
  }
  try {
    const filename =
      type === 'uplatnica' ? 'uplatnica.pdf' : type === 'upisniObrazac' ? 'upisni_obrazac.pdf' : 'potvrda_uplatnice.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Generiraj jednostavan PDF u letu
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);
    doc.fontSize(20).text(`Mock PDF: ${filename}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Ovaj PDF je generiran kao zamjena za stvarni dokument.`, { align: 'center' });
    doc.moveDown();
    const now = new Date().toLocaleString('hr-HR');
    doc.text(`Generirano: ${now}`, { align: 'center' });
    doc.end();
  } catch (err) {
    console.error('Greška pri generiranju PDF-a:', err);
    res.status(500).json({ error: 'Greška pri generiranju PDF-a' });
  }
});

/* ============ 2) Upload PDF-a po studentu ============ */
// POST /students/:id/documents/:type  (body: form-data s poljem "file")
app.post('/students/:id/documents/:type', async (req, res, next) => {
  try {
    const ctx = await ensureStudentAndType(req, res);
    if (!ctx) return;

    // multer handler
    upload.single('file')(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        const msg = err?.message || 'Greška pri uploadu';
        return res.status(400).json({ error: msg });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Nedostaje datoteka (file)' });
      }

      const { studentId, type } = ctx;
      const { filename, path: filePath, mimetype, size } = req.file;

      const record = await prisma.studentDocument.create({
        data: {
          studentId,
          type,
          filename,
          path: filePath,
          mime: mimetype,
          size,
          accepted: false,
        },
      });

      res.status(201).json({
        message: 'Dokument uspješno uploadan',
        document: {
          id: record.id,
          type: record.type,
          filename: record.filename,
          size: record.size,
          mime: record.mime,
          accepted: record.accepted,
          uploadedAt: record.uploadedAt,
          // opcijski: URL do datoteke
          url: `/uploads/${studentId}/${filename}`,
        },
      });
    });
  } catch (err) {
    next(err);
  }
});

/* ============ 3) Lista dokumenata po studentu ============ */
// GET /students/:id/documents
app.get('/students/:id/documents', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }
  try {
    const exists = await prisma.student.findUnique({ where: { id: studentId } });
    if (!exists) return res.status(404).json({ error: 'Student nije pronađen' });

    const docs = await prisma.studentDocument.findMany({
      where: { studentId },
      orderBy: [{ uploadedAt: 'desc' }],
    });

    res.json({
      studentId,
      documents: docs.map(d => ({
        id: d.id,
        type: d.type,
        filename: d.filename,
        size: d.size,
        mime: d.mime,
        accepted: d.accepted,
        uploadedAt: d.uploadedAt,
        url: `/uploads/${studentId}/${d.filename}`,
      })),
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju dokumenata:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// PATCH /students/:id/enrollment/courses (korak 2) - sada prima IMENA kolegija
app.patch('/students/:id/enrollment/courses', async (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
        return res.status(400).json({ error: 'Neispravan studentId' });
    }

    try {
        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) return res.status(404).json({ error: 'Student nije pronađen' });
        if (!student.enrollmentYearSelected) {
            return res.status(400).json({ error: 'Prvo dovršite korak 1 (odabir godine)' });
        }

        let { winterCourseNames = [], summerCourseNames = [] } = req.body || {};

        if (!Array.isArray(winterCourseNames) || !Array.isArray(summerCourseNames)) {
            return res.status(400).json({ error: 'winterCourseNames i summerCourseNames moraju biti polja stringova' });
        }

        // Očisti whitespace i ignoriraj prazne stringove
        winterCourseNames = winterCourseNames.map(n => String(n).trim()).filter(Boolean);
        summerCourseNames = summerCourseNames.map(n => String(n).trim()).filter(Boolean);

        // Max 6 po semestru
        if (winterCourseNames.length > 6 || summerCourseNames.length > 6) {
            return res.status(400).json({ error: 'Maksimalno 6 kolegija po semestru' });
        }

        // Nema duplikata među svim odabirima (case-insensitive)
        const allNames = [...winterCourseNames, ...summerCourseNames];
        const norm = (s) => s.toLowerCase();
        const uniqCount = new Set(allNames.map(norm)).size;
        if (uniqCount !== allNames.length) {
            return res.status(400).json({ error: 'Duplikati u odabranim kolegijima nisu dopušteni' });
        }

        const [semOdd, semEven] = ({ 1: [1, 2], 2: [3, 4], 3: [5, 6] })[student.enrolledYear];

        // Učitaj kolegije i status studenta
        const courses = await prisma.course.findMany();
        const byNameLower = Object.fromEntries(courses.map(c => [c.name.toLowerCase(), c]));
        const { passedSet, failedSet } = await (async () => {
            const enrollments = await prisma.studentCourse.findMany({
                where: { studentId },
                select: { status: true, courseId: true },
            });
            return {
                passedSet: new Set(enrollments.filter(e => e.status === 'PASSED').map(e => e.courseId)),
                failedSet: new Set(enrollments.filter(e => e.status === 'FAILED').map(e => e.courseId)),
            };
        })();

        // Mapiraj imena -> Course (case-insensitive) i validiraj
        const resolveCourses = (names) => {
            const resolved = [];
            const unknown = [];
            const errors = [];
            for (const name of names) {
                const c = byNameLower[norm(name)];
                if (!c) {
                    unknown.push(name);
                    continue;
                }
                if (passedSet.has(c.id)) {
                    errors.push(`Kolegij "${c.name}" je već položen`);
                    continue;
                }
                // dostupnost: bez preduvjeta ili preduvjet NIJE u failed setu
                if (c.prerequisiteId && failedSet.has(c.prerequisiteId)) {
                    errors.push(`Kolegij "${c.name}" nije dostupan (preduvjet u nepoloženim)`);
                    continue;
                }
                resolved.push(c);
            }
            return { resolved, unknown, errors };
        };

        const winterRes = resolveCourses(winterCourseNames);
        const summerRes = resolveCourses(summerCourseNames);

        if (winterRes.unknown.length || summerRes.unknown.length) {
            return res.status(400).json({
                error: 'Neki kolegiji nisu pronađeni po imenu',
                unknown: [...winterRes.unknown, ...summerRes.unknown],
            });
        }
        if (winterRes.errors.length || summerRes.errors.length) {
            return res.status(400).json({
                error: 'Neispravni odabiri kolegija',
                details: [...winterRes.errors, ...summerRes.errors],
            });
        }

        const winterCourses = winterRes.resolved;
        const summerCourses = summerRes.resolved;

        // Transakcija: obriši stare ACTIVE iz semOdd/semEven i upiši nove ACTIVE
        const result = await prisma.$transaction(async (tx) => {
            await tx.studentCourse.deleteMany({
                where: {
                    studentId,
                    status: 'ACTIVE',
                    assignedSemester: { in: [semOdd, semEven] },
                },
            });

            const winterData = winterCourses.map(c => ({
                studentId,
                courseId: c.id,
                status: 'ACTIVE',
                assignedYear: student.enrolledYear,
                assignedSemester: semOdd, // zimski izbori idu u current odd semestar
            }));
            const summerData = summerCourses.map(c => ({
                studentId,
                courseId: c.id,
                status: 'ACTIVE',
                assignedYear: student.enrolledYear,
                assignedSemester: semEven, // ljetni izbori idu u current even semestar
            }));

            if (winterData.length) await tx.studentCourse.createMany({ data: winterData });
            if (summerData.length) await tx.studentCourse.createMany({ data: summerData });

            // Spremi odabrane ID-jeve (i označi korak 2)
            const updated = await tx.student.update({
                where: { id: studentId },
                data: {
                    enrollmentStep: 2,
                    enrollmentCoursesSelected: true,
                    enrollmentDocumentsSubmitted: false,
                    enrollmentCompleted: false,
                },
                select: {
                    id: true, firstName: true, lastName: true, enrolledYear: true,
                    enrollmentStep: true, enrollmentYearSelected: true, enrollmentCoursesSelected: true,
                    enrollmentDocumentsSubmitted: true, enrollmentCompleted: true,
                },
            });

            return {
                message: 'Korak 2 spremljen (odabrani kolegiji)',
                student: updated,
                activeAssigned: {
                    winter: winterCourses.map(c => ({ id: c.id, name: c.name, ects: c.ects })),
                    summer: summerCourses.map(c => ({ id: c.id, name: c.name, ects: c.ects })),
                },
            };
        });

        res.json(result);
    } catch (err) {
        console.error('PATCH /students/:id/enrollment/courses error:', err);
        const msg = err?.message || 'Interna greška servera';
        res.status(400).json({ error: msg });
    }
});

app.post('/students/:id/enrollment/submit', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }
  try {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Student nije pronađen' });

    const requiredTypes = ['upisniObrazac', 'uplatnica', 'potvrdaUplatnice'];

    const docs = await prisma.studentDocument.findMany({
      where: { studentId, type: { in: requiredTypes } },
      orderBy: [{ uploadedAt: 'desc' }],
    });

    const latestByType = new Map();
    for (const d of docs) {
      if (!latestByType.has(d.type)) latestByType.set(d.type, d);
    }
    const missing = requiredTypes.filter(t => !latestByType.has(t));
    if (missing.length > 0) {
      return res.status(400).json({ error: 'Nedostaju dokumenti', missing });
    }

    const toAcceptIds = Array.from(latestByType.values()).map(d => d.id);

    const result = await prisma.$transaction(async (tx) => {
      // Označi dokumente prihvaćenima
      await tx.studentDocument.updateMany({
        where: { id: { in: toAcceptIds } },
        data: { accepted: true },
      });

      // Označi korak 3 dovršenim; ako su koraci 1 i 2 gotovi -> completed = true
      const updated = await tx.student.update({
        where: { id: studentId },
        data: {
          enrollmentDocumentsSubmitted: true,
          enrollmentCompleted: student.enrollmentYearSelected && student.enrollmentCoursesSelected,
        },
        select: {
          id: true, firstName: true, lastName: true, enrolledYear: true,
          enrollmentYearSelected: true, enrollmentCoursesSelected: true,
          enrollmentDocumentsSubmitted: true, enrollmentCompleted: true,
        },
      });

      return {
        student: updated,
        accepted: true,
        acceptedDocuments: requiredTypes.map(t => {
          const d = latestByType.get(t);
          return {
            id: d.id, type: d.type, filename: d.filename, size: d.size, mime: d.mime,
            uploadedAt: d.uploadedAt, url: `/uploads/${studentId}/${d.filename}`,
          };
        }),
        message: updated.enrollmentCompleted
          ? 'Upis završen: svi koraci su uspješno dovršeni.'
          : 'Dokumenti zaprimljeni, ali upis nije zaključen (provjeri prethodne korake).',
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Greška pri potvrdi upisa:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server sluša na portu ${PORT}`);
});