const express = require("express");
const prisma = require("../prisma");

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
      select: {
        studentId: true,
        courseId: true,
      },
    });

    const groups = {}; // { [courseId]: { course, students: [] } }
    const courseCapacities = {}; // { [courseId]: { max, current } }

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
      courseCapacities[courseId] = { max, current };
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

module.exports = router;
