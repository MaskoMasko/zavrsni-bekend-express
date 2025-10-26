const express = require("express");
const prisma = require("../prisma");
const PDFDocument = require('pdfkit');

const router = express.Router();

// GET /students/leaderboard
router.get("/students/leaderboard", async (req, res) => {
  const yearParam = Number(req.query.year);
  if (![1, 2, 3].includes(yearParam)) {
    return res
      .status(400)
      .json({ error: "Parametar year mora biti 1, 2 ili 3" });
  }

  const yearSemesters = { 1: [1, 2], 2: [3, 4], 3: [5, 6] };
  const [oddSem, evenSem] = yearSemesters[yearParam];

  try {
    const students = await prisma.student.findMany({
      where: { enrolledYear: yearParam, enrollmentCompleted: true },
      select: {
        id: true,
        jmbag: true,
        firstName: true,
        lastName: true,
        email: true,
        enrolledYear: true,
        repeatingYear: true,
        module: true,
        totalEcts: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!students.length) {
      return res.json({
        year: yearParam,
        totalStudents: 0,
        courseCapacities: {},
        groups: {},
      });
    }

    const studentIds = students.map((s) => s.id);

    const coursesThisYear = await prisma.course.findMany({
      where: { year: yearParam },
      select: {
        id: true,
        name: true,
        ects: true,
        semester: true,
        year: true,
        capacity: true,
        holder: true,
        holderEmail: true,
        assistant: true,
        assistantEmail: true,
      },
    });
    const courseMetaById = new Map(coursesThisYear.map((c) => [c.id, c]));

    const activeEnrollments = await prisma.studentCourse.findMany({
      where: {
        studentId: { in: studentIds },
        status: "ACTIVE",
        assignedSemester: { in: [oddSem, evenSem] },
      },
      select: { studentId: true, courseId: true },
    });

    const groups = {};
    const courseCapacities = {};

    for (const c of coursesThisYear) {
      groups[c.id] = {
        course: {
          id: c.id,
          name: c.name,
          ects: c.ects,
          semester: c.semester,
          year: c.year,
          capacity: c.capacity,
          holder: c.holder,
          holderEmail: c.holderEmail || null,
          assistant: c.assistant || null,
          assistantEmail: c.assistantEmail || null,
        },
        students: [],
      };
    }

    const studentMetaById = new Map(students.map((s) => [s.id, s]));

    for (const e of activeEnrollments) {
      const course = courseMetaById.get(e.courseId);
      const student = studentMetaById.get(e.studentId);
      if (!course || !student) continue;

      groups[e.courseId].students.push({
        id: student.id,
        jmbag: student.jmbag,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        repeatingYear: student.repeatingYear,
        module: student.module,
        stats: { ectsPassedTotal: student.totalEcts },
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
      });
    }

    for (const courseId of Object.keys(groups)) {
      groups[courseId].students.sort((a, b) => {
        const aECTS = a.stats?.ectsPassedTotal || 0;
        const bECTS = b.stats?.ectsPassedTotal || 0;
        if (bECTS !== aECTS) return bECTS - aECTS;
        return a.lastName.localeCompare(b.lastName);
      });
      const max = groups[courseId].course.capacity || 0;
      const current = groups[courseId].students.length;
      courseCapacities[courseId] = {
        name: groups[courseId].course.name,
        max,
        current,
      };
    }

    res.json({
      year: yearParam,
      totalStudents: students.length,
      courseCapacities,
      groups,
    });
  } catch (err) {
    console.error("Greška /students/leaderboard:", err);
    res.status(500).json({ error: "Interna greška servera" });
  }
});

// GET /students
router.get("/students", async (req, res) => {
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
      orderBy: { id: "asc" },
    });
    res.json(students);
  } catch (err) {
    console.error("Greška pri dohvatu studenata:", err);
    res.status(500).json({ error: "Interna greška servera" });
  }
});

// GET /students/:id/courses (failed + available) — PRVI (ostaje iznad)
router.get("/students/:id/courses", async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: "Neispravan studentId" });
  }
  const isWinterSem = (sem) => [1, 3, 5].includes(sem);
  const isSummerSem = (sem) => [2, 4, 6].includes(sem);
  const ensureYearSimple = (y) => {
    const yy = Number(y);
    if (![1, 2, 3].includes(yy)) throw new Error("year mora biti 1, 2 ili 3");
    return yy;
  };
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student)
      return res.status(404).json({ error: "Student nije pronađen" });

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
      }),
    ]);

    const failedSet = new Set(
      enrollments.filter((e) => e.status === "FAILED").map((e) => e.courseId)
    );
    const enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));

    const winterFailedMap = new Map();
    const summerFailedMap = new Map();
    for (const e of enrollments) {
      if (e.status !== "FAILED") continue;
      const c = e.course;
      if (isWinterSem(c.semester)) winterFailedMap.set(c.id, c);
      else if (isSummerSem(c.semester)) summerFailedMap.set(c.id, c);
    }

    const failedCourses = {
      winter: Array.from(winterFailedMap.values()).map((c) => ({
        id: c.id,
        name: c.name,
        ects: c.ects,
        semester: c.semester,
        year: c.year,
        prerequisiteId: c.prerequisiteId,
      })),
      summer: Array.from(summerFailedMap.values()).map((c) => ({
        id: c.id,
        name: c.name,
        ects: c.ects,
        semester: c.semester,
        year: c.year,
        prerequisiteId: c.prerequisiteId,
      })),
    };

    const targetYearCourses = courses.filter((c) => c.year === targetYear);
    const availableTargetYear = targetYearCourses.filter(
      (c) => !c.prerequisiteId || !failedSet.has(c.prerequisiteId)
    );
    const missingYear1 =
      targetYear >= 2
        ? courses.filter((c) => c.year === 1 && !enrolledCourseIds.has(c.id))
        : [];
    const availableMap = new Map();
    for (const c of availableTargetYear) availableMap.set(c.id, c);
    for (const c of missingYear1) availableMap.set(c.id, c);

    const availableCourses = {
      year: targetYear,
      courses: Array.from(availableMap.values())
        .sort((a, b) => a.semester - b.semester || a.name.localeCompare(b.name))
        .map((c) => ({
          id: c.id,
          name: c.name,
          ects: c.ects,
          semester: c.semester,
          year: c.year,
          prerequisiteId: c.prerequisiteId,
          prerequisiteBlocked:
            !!c.prerequisiteId && failedSet.has(c.prerequisiteId),
        })),
    };

    res.json({ studentId, targetYear, failedCourses, availableCourses });
  } catch (err) {
    console.error("Greška /students/:id/courses:", err);
    res.status(500).json({ error: "Interna greška servera" });
  }
});

// GET /students/:id/courses (grouped enrollments) — DRUGI (ostaje ispod)
router.get("/students/:id/courses", async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId))
    return res.status(400).json({ error: "Neispravan studentId" });
  try {
    const enrollments = await prisma.studentCourse.findMany({
      where: { studentId },
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
      orderBy: [{ assignedSemester: "asc" }, { status: "asc" }, { id: "asc" }],
    });

    const grouped = { ACTIVE: [], PASSED: [], FAILED: [] };
    const semesterLoad = {};

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
      if (e.status === "ACTIVE") {
        const sem = e.assignedSemester;
        if (!semesterLoad[sem])
          semesterLoad[sem] = { activeCount: 0, activeEcts: 0 };
        semesterLoad[sem].activeCount += 1;
        semesterLoad[sem].activeEcts += e.course.ects;
      }
    }
    res.json({ studentId, grouped, semesterLoad });
  } catch (err) {
    console.error("Greška pri dohvatu upisa studenta:", err);
    res.status(500).json({ error: "Interna greška servera" });
  }
});

// GET /students/:id (student info + grouped enrollments)
router.get("/students/:id", async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: "Neispravan studentId" });
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
        // enrollment steps
        enrollmentStep: true,
        enrollmentYearSelected: true,
        enrollmentCoursesSelected: true,
        enrollmentDocumentsSubmitted: true,
        enrollmentCompleted: true,
        totalEcts: true,
        passedCount: true,
        failedCount: true,
        activeCount: true,

        createdAt: true,
        updatedAt: true,
      },
    });

    if (!student) {
      return res.status(404).json({ error: "Student nije pronađen" });
    }

    const enrollments = await prisma.studentCourse.findMany({
      where: { studentId },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            ects: true,
            semester: true,
            year: true,
            holder: true,
            holderEmail: true,
            assistant: true,
            assistantEmail: true,
          },
        },
      },
      orderBy: [{ assignedSemester: "asc" }, { id: "asc" }],
    });

    const grouped = { ACTIVE: [], PASSED: [], FAILED: [] };
    for (const e of enrollments) {
      const record = {
        enrollmentId: e.id,
        courseId: e.course.id,
        name: e.course.name,
        ects: e.course.ects,
        semester: e.course.semester,
        year: e.course.year,
        holder: e.course.holder,
        holderEmail: e.course.holderEmail || null,
        assistant: e.course.assistant || null,
        assistantEmail: e.course.assistantEmail || null,
        assignedSemester: e.assignedSemester,
        assignedYear: e.assignedYear,
      };
      if (!grouped[e.status]) grouped[e.status] = [];
      grouped[e.status].push(record);
    }

    res.json({
      student,
      enrollments: grouped,
    });
  } catch (err) {
    console.error("Greška pri dohvaćanju studenta:", err);
    res.status(500).json({ error: "Interna greška servera" });
  }
});

// GET /students/:id/summary (student info + summarized enrollments for other students views)
router.get("/students/:id/summary", async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: "Neispravan studentId" });
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
        enrollmentCoursesSelected: true,
        enrollmentStep: true,
        enrollmentYearSelected: true,
        enrollmentCompleted: true,
        enrollmentDocumentsSubmitted: true,
        module: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!student)
      return res.status(404).json({ error: "Student nije pronađen" });

    const enrollments = await prisma.studentCourse.findMany({
      where: { studentId },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            ects: true,
            semester: true,
            year: true,
          },
        },
      },
      orderBy: [{ assignedSemester: "asc" }, { id: "asc" }],
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
    console.error("Greška pri dohvaćanju studenta:", err);
    res.status(500).json({ error: "Interna greška servera" });
  }
});

// GET /courses/:id — full course details + basic enrollment status summary
router.get("/courses/:id", async (req, res) => {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId)) {
    return res.status(400).json({ error: "Neispravan courseId" });
  }

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        name: true,
        description: true,
        ects: true,
        semester: true,
        year: true,
        holder: true,
        holderEmail: true,
        assistant: true,
        assistantEmail: true,
        prerequisite: {
          select: { id: true, name: true, semester: true, year: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!course) {
      return res.status(404).json({ error: "Kolegij nije pronađen" });
    }

    // Enrollment status summary for this course
    const statusGroups = await prisma.studentCourse.groupBy({
      by: ["status"],
      where: { courseId },
      _count: { _all: true },
    });

    const statusCounts = {
      ACTIVE: 0,
      PASSED: 0,
      FAILED: 0,
    };
    let totalEnrollments = 0;
    for (const g of statusGroups) {
      statusCounts[g.status] = g._count._all;
      totalEnrollments += g._count._all;
    }

    res.json({
      course,
      stats: {
        totalEnrollments,
        statusCounts,
      },
    });
  } catch (err) {
    console.error("Greška pri dohvaćanju kolegija:", err);
    res.status(500).json({ error: "Interna greška servera" });
  }
});

// GET /students/:id/transcript - Transkript predmeta (svi polozeni predmeti)
router.get('/students/:id(\\d+)/transcript', async (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
        return res.status(400).json({ error: 'Neispravan studentId' });
    }

    try {
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                jmbag: true,
                email: true,
                enrolledYear: true,
                module: true,
                createdAt: true,
            },
        });

        if (!student) {
            return res.status(404).json({ error: 'Student nije pronađen' });
        }

        const passedCourses = await prisma.studentCourse.findMany({
            where: {
                studentId,
                status: 'PASSED',
            },
            include: {
                course: {
                    select: {
                        name: true,
                        ects: true,
                        semester: true,
                        year: true,
                    },
                },
            },
            orderBy: [
                { assignedYear: 'asc' },
                { assignedSemester: 'asc' },
            ],
        });

        const coursesByYear = {};
        let totalEcts = 0;

        passedCourses.forEach(enrollment => {
            const year = enrollment.assignedYear;
            if (!coursesByYear[year]) {
                coursesByYear[year] = [];
            }

            coursesByYear[year].push({
                name: enrollment.course.name,
                ects: enrollment.course.ects,
                semester: enrollment.assignedSemester,
                originalSemester: enrollment.course.semester,
                originalYear: enrollment.course.year,
            });

            totalEcts += enrollment.course.ects;
        });

        const filename = `transkript_${student.jmbag}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.pipe(res);

        doc.fontSize(20).text('TRANSKRIPT PREDMETA', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12);
        doc.text(`Student: ${student.firstName} ${student.lastName}`);
        doc.text(`JMBAG: ${student.jmbag}`);
        doc.text(`Email: ${student.email}`);
        doc.text(`Modul: ${student.module || 'Nije definiran'}`);
        doc.text(`Godina upisa: ${student.createdAt.getFullYear()}`);
        doc.moveDown();

        doc.fontSize(14).text(`UKUPNO OSTVARENIH ECTS BODOVA: ${totalEcts}`, { underline: true });
        doc.moveDown();

        Object.keys(coursesByYear).sort().forEach(year => {
            doc.fontSize(14).text(`${year}. GODINA STUDIJA`, { underline: true });
            doc.moveDown(0.5);

            const yearCourses = coursesByYear[year];
            let yearEcts = 0;

            yearCourses.forEach((course, index) => {
                doc.fontSize(10);
                doc.text(`${index + 1}. ${course.name}`, { continued: true });
                doc.text(` - ${course.ects} ECTS`, { align: 'right' });
                doc.fontSize(8);
                doc.text(`Semestar: ${course.semester} | Izvorni semestar: ${course.originalSemester}`);
                yearEcts += course.ects;
            });

            doc.moveDown(0.5);
            doc.fontSize(10).text(`ECTS ${year}. godine: ${yearEcts}`, { align: 'right' });
            doc.moveDown();
        });

        doc.moveDown(2);
        doc.fontSize(10);
        doc.text('_________________________________________', { align: 'right' });
        doc.text('Potpis dekan/delegiranog službenika', { align: 'right' });
        doc.text(`Izgenerirano: ${new Date().toLocaleDateString('hr-HR')}`, { align: 'right' });

        doc.end();
    } catch (err) {
        console.error('GET /students/:id/transcript error:', err);
        res.status(500).json({ error: 'Interna greška servera' });
    }
});

// GET /students/:id/study-confirmation - Potvrda o studiranju
router.get('/students/:id(\\d+)/study-confirmation', async (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
        return res.status(400).json({ error: 'Neispravan studentId' });
    }

    try {
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                jmbag: true,
                email: true,
                enrolledYear: true,
                module: true,
                repeatingYear: true,
                createdAt: true,
            },
        });

        if (!student) {
            return res.status(404).json({ error: 'Student nije pronađen' });
        }

        const filename = `potvrda_o_studiranju_${student.jmbag}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.pipe(res);

        doc.fontSize(16).text('SVEUCILISTE', { align: 'center' });
        doc.fontSize(14).text('FAKULTET INFORMATICKIH TEHNOLOGIJA', { align: 'center' });
        doc.moveDown();
        doc.fontSize(18).text('POTVRDA O STUDIRANJU', { align: 'center', underline: true });
        doc.moveDown(2);

        doc.fontSize(12);
        doc.text('Potvrdjujemo da je:');
        doc.moveDown();

        doc.fontSize(14);
        doc.text(`${student.firstName} ${student.lastName}`, { align: 'center' });
        doc.fontSize(12);
        doc.text(`JMBAG: ${student.jmbag}`, { align: 'center' });
        doc.moveDown();

        doc.text('redoviti student ovog sveucilista i trenutno pohadja:');
        doc.moveDown();

        doc.fontSize(14);
        doc.text(`${student.enrolledYear}. godinu studija`, { align: 'center' });
        doc.fontSize(12);
        doc.text(`Studijski program: ${student.module || 'Racunarstvo'}`, { align: 'center' });
        doc.moveDown();

        if (student.repeatingYear) {
            doc.text('NAPOMENA: Student ponavlja godinu studija.', { color: 'red', align: 'center' });
            doc.moveDown();
        }

        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        doc.text(`Potvrda vrijedi za akademsku godinu ${currentYear}/${nextYear}.`);
        doc.moveDown(2);

        doc.text(`U ${new Date().toLocaleDateString('hr-HR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })}`);
        doc.moveDown(3);

        doc.text('_________________________________________', { align: 'right' });
        doc.text('Dekan/delegirani sluzbenik', { align: 'right' });
        doc.moveDown();
        doc.fontSize(10).text('(pecat i potpis)', { align: 'right' });

        doc.moveDown(4);
        doc.fontSize(8);
        doc.text('Napomena: Ova potvrda automatski je generirana i vrijedi bez potpisa i pecata samo uz online provjeru valjanosti.', { align: 'center' });

        doc.end();
    } catch (err) {
        console.error('GET /students/:id/study-confirmation error:', err);
        res.status(500).json({ error: 'Interna greška servera' });
    }
});

module.exports = router;
