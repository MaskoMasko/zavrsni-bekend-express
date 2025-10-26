require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const { UPLOAD_ROOT } = require('./config');

const authRoutes = require('./routes/auth');
const studentsRoutes = require('./routes/students');
const enrollmentRoutes = require('./routes/enrollment');
const documentsRoutes = require('./routes/documents');

const app = express();
app.use(express.json());

if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
app.use('/uploads', express.static(UPLOAD_ROOT));

app.use(authRoutes);
app.use(studentsRoutes);
app.use(enrollmentRoutes);
app.use(documentsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server sluša na portu ${PORT}`);
})

module.exports = app;