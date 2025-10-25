const express = require('express');
const prisma = require('../prisma');
const { ensureYear, ensureModule } = require('../helpers/utils');
const { yearSemesters } = require('../config');
const { getActiveCoursesPayload, sendActiveCoursesPdf, sendActiveCoursesCsv } = require('../helpers/activeCourses');

const router = express.Router();

// PATCH /students/:id (korak 1: odabir godine)
router.patch('/students/:id', async (req, res) => {
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

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.student.update({
        where: { id: studentId },
        data: {
          enrolledYear: nextYear,
          repeatingYear: nextRepeat,
          module: nextModule,
          enrollmentYearSelected: true,
          enrollmentCoursesSelected: false,
          enrollmentDocumentsSubmitted: false,
          enrollmentCompleted: false,
        },
        select: {
          id: true, jmbag: true, firstName: true, lastName: true, email: true,
          enrolledYear: true, repeatingYear: true, module: true,
          enrollmentYearSelected: true, enrollmentCoursesSelected: true,
          enrollmentDocumentsSubmitted: true, enrollmentCompleted: true,
          createdAt: true, updatedAt: true,
        },
      });

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

// PATCH /students/:id/enrollment/courses (korak 2: odabir predmeta po imenu)
router.patch('/students/:id/enrollment/courses', async (req, res) => {
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
    winterCourseNames = winterCourseNames.map(n => String(n).trim()).filter(Boolean);
    summerCourseNames = summerCourseNames.map(n => String(n).trim()).filter(Boolean);
    if (winterCourseNames.length > 6 || summerCourseNames.length > 6) {
      return res.status(400).json({ error: 'Maksimalno 6 kolegija po semestru' });
    }
    const norm = (s) => s.toLowerCase();
    const allNames = [...winterCourseNames, ...summerCourseNames];
    if (new Set(allNames.map(norm)).size !== allNames.length) {
      return res.status(400).json({ error: 'Duplikati u odabranim kolegijima nisu dopušteni' });
    }

    const [semOdd, semEven] = yearSemesters[student.enrolledYear];
    const courses = await prisma.course.findMany();
    const byNameLower = Object.fromEntries(courses.map(c => [c.name.toLowerCase(), c]));

    const enrollments = await prisma.studentCourse.findMany({
      where: { studentId },
      select: { status: true, courseId: true },
    });
    const passedSet = new Set(enrollments.filter(e => e.status === 'PASSED').map(e => e.courseId));
    const failedSet = new Set(enrollments.filter(e => e.status === 'FAILED').map(e => e.courseId));

    const resolveCourses = (names) => {
      const resolved = [];
      const unknown = [];
      const errors = [];
      for (const name of names) {
        const c = byNameLower[norm(name)];
        if (!c) { unknown.push(name); continue; }
        if (passedSet.has(c.id)) { errors.push(`Kolegij "${c.name}" je već položen`); continue; }
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

    await prisma.$transaction(async (tx) => {
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
        assignedSemester: semOdd,
      }));
      const summerData = summerCourses.map(c => ({
        studentId,
        courseId: c.id,
        status: 'ACTIVE',
        assignedYear: student.enrolledYear,
        assignedSemester: semEven,
      }));

      if (winterData.length) await tx.studentCourse.createMany({ data: winterData });
      if (summerData.length) await tx.studentCourse.createMany({ data: summerData });

      await tx.student.update({
        where: { id: studentId },
        data: {
          enrollmentStep: 2,
          enrollmentCoursesSelected: true,
          enrollmentDocumentsSubmitted: false,
          enrollmentCompleted: false,
        },
      });
    });

    const payload = await getActiveCoursesPayload(studentId);
    if (payload.error) return res.status(500).json({ error: 'Greška pri dohvaćanju aktivnih predmeta nakon spremanja' });

    return res.json({
      message: 'Korak 2 spremljen (odabrani kolegiji)',
      currentYearSemesters: payload.currentYearSemesters,
      active: payload.active,
    });
  } catch (err) {
    console.error('PATCH /students/:id/enrollment/courses error:', err);
    const msg = err?.message || 'Interna greška servera';
    res.status(400).json({ error: msg });
  }
});

// GET /students/:id/enrollment/active-courses
router.get('/students/:id(\\d+)/enrollment/active-courses', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }
  try {
    const payload = await getActiveCoursesPayload(studentId);
    if (payload.error) return res.status(404).json({ error: payload.error });
    res.json({
      currentYearSemesters: payload.currentYearSemesters,
      active: payload.active,
    });
  } catch (err) {
    console.error('GET /students/:id/enrollment/active-courses error:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// GET /students/:id/enrollment/active-courses/download?format=pdf|csv
router.get('/students/:id(\\d+)/enrollment/active-courses/download', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }
  const format = String(req.query.format || 'pdf').toLowerCase();
  try {
    const payload = await getActiveCoursesPayload(studentId);
    if (payload.error) return res.status(404).json({ error: payload.error });
    if (format === 'csv') return sendActiveCoursesCsv(res, payload);
    return sendActiveCoursesPdf(res, payload);
  } catch (err) {
    console.error('GET /students/:id/enrollment/active-courses/download error:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

// POST /students/:id/enrollment/submit
router.post('/students/:id/enrollment/submit', async (req, res) => {
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
      await tx.studentDocument.updateMany({
        where: { id: { in: toAcceptIds } },
        data: { accepted: true },
      });

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

module.exports = router;