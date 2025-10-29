const PDFDocument = require('pdfkit');
const prisma = require('../prisma');
const { yearSemesters } = require('../config');

async function getActiveCoursesPayload(studentId) {
  const student = await prisma.student.findUnique({
    where: { id: Number(studentId) },
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
  if (!student) return { error: 'Student nije pronađen' };

  const [semOdd, semEven] = yearSemesters[student.enrolledYear];

  const activeEnrollments = await prisma.studentCourse.findMany({
    where: {
      studentId: Number(studentId),
      status: 'ACTIVE',
      assignedSemester: { in: [semOdd, semEven] },
    },
    include: {
      course: {
        select: {
          id: true, name: true, ects: true, semester: true, year: true, prerequisiteId: true,
        },
      },
    },
    orderBy: [{ assignedSemester: 'asc' }, { id: 'asc' }],
  });

  const winter = [];
  const summer = [];
  for (const e of activeEnrollments) {
    const item = {
      enrollmentId: e.id,
      courseId: e.course.id,
      name: e.course.name,
      ects: e.course.ects,
      originalSemester: e.course.semester,
      originalYear: e.course.year,
      assignedSemester: e.assignedSemester,
      assignedYear: e.assignedYear,
      prerequisiteId: e.course.prerequisiteId,
    };
    if (e.assignedSemester === semOdd) winter.push(item);
    else if (e.assignedSemester === semEven) summer.push(item);
  }

  const sumEcts = (arr) => arr.reduce((acc, c) => acc + (c.ects || 0), 0);

  return {
    student,
    currentYearSemesters: { odd: semOdd, even: semEven },
    active: {
      winter: { count: winter.length, ects: sumEcts(winter), courses: winter },
      summer: { count: summer.length, ects: sumEcts(summer), courses: summer },
    },
  };
}

function sendActiveCoursesPdf(res, payload) {
  const { student, currentYearSemesters, active } = payload;
  const filename = `active_courses_${student.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text('Aktivni predmeti (korak 2)', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Student: ${student.firstName} ${student.lastName} (${student.email})`);
  doc.text(`Godina: ${student.enrolledYear} • Modul: ${student.module || '-'}`);
  doc.text(`Semestri tekuće godine: Zimski ${currentYearSemesters.odd}, Ljetni ${currentYearSemesters.even}`);
  doc.moveDown();

  doc.fontSize(14).text(`Zimski semestar (ECTS: ${active.winter.ects}, predmeta: ${active.winter.count})`);
  doc.moveDown(0.5);
  if (active.winter.courses.length === 0) {
    doc.fontSize(12).text('Nema aktivnih predmeta.', { indent: 20 });
  } else {
    active.winter.courses.forEach((c, idx) => {
      doc.fontSize(12).text(
        `${idx + 1}. ${c.name} — ${c.ects} ECTS (izvorni semestar ${c.originalSemester}, godina ${c.originalYear})`,
        { indent: 20 }
      );
    });
  }
  doc.moveDown();

  doc.fontSize(14).text(`Ljetni semestar (ECTS: ${active.summer.ects}, predmeta: ${active.summer.count})`);
  doc.moveDown(0.5);
  if (active.summer.courses.length === 0) {
    doc.fontSize(12).text('Nema aktivnih predmeta.', { indent: 20 });
  } else {
    active.summer.courses.forEach((c, idx) => {
      doc.fontSize(12).text(
        `${idx + 1}. ${c.name} — ${c.ects} ECTS (izvorni semestar ${c.originalSemester}, godina ${c.originalYear})`,
        { indent: 20 }
      );
    });
  }

  doc.end();
}

function escapeCsv(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sendActiveCoursesCsv(res, payload) {
  const { student, currentYearSemesters, active } = payload;
  const filename = `active_courses_${student.id}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const headerLines = [
    `Student,${escapeCsv(`${student.firstName} ${student.lastName}`)}`,
    `Email,${escapeCsv(student.email)}`,
    `Godina,${student.enrolledYear}`,
    `Modul,${escapeCsv(student.module || '-')}`,
    `Zimski semestar,${currentYearSemesters.odd}`,
    `Ljetni semestar,${currentYearSemesters.even}`,
    '',
  ];

  const tableHeader = [
    'Semestar', 'Rbr', 'Naziv', 'ECTS', 'Izvorni semestar', 'Izvorna godina',
  ].join(',');

  const rows = [];
  active.winter.courses.forEach((c, idx) => {
    rows.push(['Zimski', idx + 1, escapeCsv(c.name), c.ects, c.originalSemester, c.originalYear].join(','));
  });
  active.summer.courses.forEach((c, idx) => {
    rows.push(['Ljetni', idx + 1, escapeCsv(c.name), c.ects, c.originalSemester, c.originalYear].join(','));
  });

  const ectsSummary = ['', `Zimski ECTS,${active.winter.ects}`, `Ljetni ECTS,${active.summer.ects}`];

  const csv = [...headerLines, tableHeader, ...rows, ...ectsSummary].join('\n');
  res.send(csv);
}

module.exports = {
  getActiveCoursesPayload,
  sendActiveCoursesPdf,
  sendActiveCoursesCsv,
};