const express = require('express');
const prisma = require('../prisma');

const router = express.Router();

// GET /students/leaderboard
router.get('/students/leaderboard', async (req, res) => {
  const yearParam = Number(req.query.year);
  if (![1, 2, 3].includes(yearParam)) {
    return res.status(400).json({ error: 'Parametar year mora biti 1, 2 ili 3' });
  }
  function getModuleCapacity(modKey) {
    if (!modKey || modKey === 'UNASSIGNED') return 0;
    const s = String(modKey).toUpperCase();
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return 25 + (sum % 16);
  }
  try {
    const students = await prisma.student.findMany({
      where: { enrolledYear: yearParam, enrollmentCompleted: true },
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
        ectsByStudent.set(e.studentId, (ectsByStudent.get(e.studentId) || 0) + (e.course?.ects || 0));
      }
    }

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

    const moduleCapacities = {};
    for (const key of Object.keys(groups)) {
      const max = getModuleCapacity(key);
      const current = groups[key].length;
      moduleCapacities[key] = { max, current };
    }

    res.json({
      year: yearParam,
      totalStudents: students.length,
      moduleCapacities,
      groups,
    });
  } catch (err) {
    console.error('Greška /students/leaderboard:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// GET /students
router.get('/students', async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      select: {
        id: true, jmbag: true, firstName: true, lastName: true, email: true,
        enrolledYear: true, repeatingYear: true, module: true, createdAt: true, updatedAt: true,
      },
      orderBy: { id: 'asc' },
    });
    res.json(students);
  } catch (err) {
    console.error('Greška pri dohvatu studenata:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// GET /students/:id/courses (failed + available) — PRVI (ostaje iznad)
router.get('/students/:id/courses', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }
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

    let targetYear = student.enrolledYear;
    if (req.query?.year !== undefined) {
      try {
        targetYear = ensureYearSimple(req.query.year);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const [courses, enrollments] = await Promise.all([
      prisma.course.findMany({
        select: { id: true, name: true, ects: true, semester: true, year: true, prerequisiteId: true },
      }),
      prisma.studentCourse.findMany({
        where: { studentId },
        include: { course: { select: { id: true, name: true, ects: true, semester: true, year: true, prerequisiteId: true } } },
      }),
    ]);

    const failedSet = new Set(enrollments.filter(e => e.status === 'FAILED').map(e => e.courseId));
    const enrolledCourseIds = new Set(enrollments.map(e => e.courseId));

    const winterFailedMap = new Map();
    const summerFailedMap = new Map();
    for (const e of enrollments) {
      if (e.status !== 'FAILED') continue;
      const c = e.course;
      if (isWinterSem(c.semester)) winterFailedMap.set(c.id, c);
      else if (isSummerSem(c.semester)) summerFailedMap.set(c.id, c);
    }

    const failedCourses = {
      winter: Array.from(winterFailedMap.values()).map(c => ({
        id: c.id, name: c.name, ects: c.ects, semester: c.semester, year: c.year, prerequisiteId: c.prerequisiteId,
      })),
      summer: Array.from(summerFailedMap.values()).map(c => ({
        id: c.id, name: c.name, ects: c.ects, semester: c.semester, year: c.year, prerequisiteId: c.prerequisiteId,
      })),
    };

    const targetYearCourses = courses.filter(c => c.year === targetYear);
    const availableTargetYear = targetYearCourses.filter(c => !c.prerequisiteId || !failedSet.has(c.prerequisiteId));
    const missingYear1 = targetYear >= 2 ? courses.filter(c => c.year === 1 && !enrolledCourseIds.has(c.id)) : [];
    const availableMap = new Map();
    for (const c of availableTargetYear) availableMap.set(c.id, c);
    for (const c of missingYear1) availableMap.set(c.id, c);

    const availableCourses = {
      year: targetYear,
      courses: Array.from(availableMap.values())
        .sort((a, b) => a.semester - b.semester || a.name.localeCompare(b.name))
        .map(c => ({
          id: c.id, name: c.name, ects: c.ects, semester: c.semester, year: c.year,
          prerequisiteId: c.prerequisiteId, prerequisiteBlocked: !!c.prerequisiteId && failedSet.has(c.prerequisiteId),
        })),
    };

    res.json({ studentId, targetYear, failedCourses, availableCourses });
  } catch (err) {
    console.error('Greška /students/:id/courses:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// GET /students/:id/courses (grouped enrollments) — DRUGI (ostaje ispod)
router.get('/students/:id/courses', async (req, res) => {
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
    const semesterLoad = {};

    for (const e of enrollments) {
      grouped[e.status] = grouped[e.status] || [];
      grouped[e.status].push({
        enrollmentId: e.id, courseId: e.course.id, name: e.course.name,
        ects: e.course.ects, courseSemester: e.course.semester, courseYear: e.course.year,
        assignedSemester: e.assignedSemester, assignedYear: e.assignedYear,
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

// GET /students/:id (student info + grouped enrollments)
router.get('/students/:id', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true, jmbag: true, firstName: true, lastName: true, email: true,
        enrolledYear: true, repeatingYear: true, enrollmentCoursesSelected: true, enrollmentStep: true,
        enrollmentYearSelected: true, enrollmentCompleted: true, enrollmentDocumentsSubmitted: true,
        module: true, createdAt: true, updatedAt: true,
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

module.exports = router;