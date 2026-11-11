import {
  getSupabaseConfig,
  getTeacherSession,
  signIn,
  signOut,
  teacherRequest
} from './supabase.js';

const STORAGE_KEY = 'ditari-online-students';
const TEST_DATES_KEY = 'ditari-online-test-dates';
const youngerGradeSubjects = [
  'Matematikë',
  'Gjuhë shqipe',
  'Gjuhë angleze',
  'Shkencë',
  'Histori',
  'Gjeografi',
  'Art',
  'Edukatë fizike'
];
const upperGradeSubjects = [
  'Gjuhë Shqipe',
  'Gjuhë Angleze',
  'Gjuhë Gjermane',
  'Matematikë',
  'Dituri Natyre',
  'Biologji',
  'Fizikë',
  'Kimi',
  'Histori',
  'Gjeografi',
  'Edukatë Qytetare',
  'Art Figurativ',
  'Art Muzikor',
  'Edukatë Fizike, Sporte dhe Shëndet',
  'Teknologji me TIK',
  'Lëndë Zgjedhore'
];
const remarks = [
  'Excellent',
  'Good',
  'Satisfactory',
  'Needs improvement',
  'Late submissions',
  'Excellent participation'
];
const monthNamesSq = [
  'janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor',
  'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'
];
const weekdayNamesSq = [
  'e diel', 'e hënë', 'e martë', 'e mërkurë', 'e enjte', 'e premte', 'e shtunë'
];
const remarkLabels = {
  Excellent: 'Shkëlqyeshëm',
  Good: 'Mirë',
  Satisfactory: 'Kënaqshëm',
  'Needs improvement': 'Nevojitet përmirësim',
  'Late submissions': 'Dorëzime me vonesë',
  'Excellent participation': 'Pjesëmarrje e shkëlqyeshme'
};
const form = document.getElementById('studentForm');
const nameInput = document.getElementById('studentName');
const classInput = document.getElementById('studentClass');
const absenceInput = document.getElementById('absenceCount');
const parentCodeInput = document.getElementById('parentCode');
const remarkInput = document.getElementById('remark');
const noteInput = document.getElementById('teacherNote');
const gradebookHead = document.getElementById('gradebookHead');
const studentTableBody = document.getElementById('studentTableBody');
const studentCount = document.getElementById('studentCount');
const classFilter = document.getElementById('classFilter');
const formMessage = document.getElementById('formMessage');
const testCalendarForm = document.getElementById('testCalendarForm');
const testDateInput = document.getElementById('testDate');
const testClassInput = document.getElementById('testClass');
const testSubjectInput = document.getElementById('testSubject');
const testDetailsInput = document.getElementById('testDetails');
const calendarMessage = document.getElementById('calendarMessage');
const calendarMonthLabel = document.getElementById('calendarMonth');
const calendarDays = document.getElementById('calendarDays');
const upcomingTestList = document.getElementById('upcomingTestList');
const teacherAuth = document.getElementById('teacherAuth');
const teacherLoginForm = document.getElementById('teacherLoginForm');
const teacherAuthMessage = document.getElementById('teacherAuthMessage');
const teacherSignedIn = document.getElementById('teacherSignedIn');
const teacherIdentity = document.getElementById('teacherIdentity');
const teacherWorkspace = document.getElementById('teacherWorkspace');
const teacherLogoutButton = document.getElementById('teacherLogout');
const localImportPanel = document.getElementById('localImportPanel');
const importLocalDataButton = document.getElementById('importLocalData');
const localImportFileInput = document.getElementById('localImportFile');
const importFileDataButton = document.getElementById('importFileData');
let studentsCache = [];
let testDatesCache = [];
let teacherSession = null;
let dataIsLoaded = false;
const classes = Array.from({ length: 9 }, (_, grade) =>
  Array.from({ length: 9 }, (_, section) => `${grade + 1}/${section + 1}`)
).flat();
const displayedMonth = new Date();
displayedMonth.setDate(1);

classes.forEach((className) => {
  const option = document.createElement('option');
  option.value = className;
  option.textContent = className;
  classFilter.append(option);

  const testClassOption = option.cloneNode(true);
  testClassInput.append(testClassOption);
});

function getSubjectsForClass(className) {
  const grade = Number(className.split('/')[0]);
  return grade >= 6 ? upperGradeSubjects : youngerGradeSubjects;
}

function translateSubjectName(subject, className) {
  const gradeLevel = Number(className.split('/')[0]);
  const translations = {
    Mathematics: 'Matematikë',
    'Albanian language': gradeLevel >= 6 ? 'Gjuhë Shqipe' : 'Gjuhë shqipe',
    English: gradeLevel >= 6 ? 'Gjuhë Angleze' : 'Gjuhë angleze',
    History: 'Histori',
    Geography: 'Gjeografi',
    Science: gradeLevel === 6 ? 'Dituri Natyre' : gradeLevel >= 7 ? 'Biologji' : 'Shkencë',
    Art: gradeLevel >= 6 ? 'Art Figurativ' : 'Art',
    'Physical education': gradeLevel >= 6 ? 'Edukatë Fizike, Sporte dhe Shëndet' : 'Edukatë fizike'
  };
  return translations[subject] || subject;
}

function getUniqueCode(existingCodes) {
  let candidate;
  const bytes = new Uint8Array(8);
  do {
    crypto.getRandomValues(bytes);
    candidate = `DT-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  } while (existingCodes.includes(candidate));
  return candidate;
}

function normalizeGrade(value) {
  const grade = Number(value);
  if (!Number.isFinite(grade)) return null;
  if (grade > 5) return Math.min(5, Number((grade / 2).toFixed(1)));
  return grade >= 1 ? grade : null;
}

function migrateStudent(student) {
  const className = student.className || '1/1';
  const allowedSubjects = getSubjectsForClass(className);
  let subjects = Array.isArray(student.subjects) ? student.subjects : [];

  subjects = subjects.map((subject) => {
    if (subject.grade !== undefined) {
      return { name: subject.name, grade: normalizeGrade(subject.grade) };
    }

    const assessments = [...(subject.assessment1 || []), ...(subject.assessment2 || [])]
      .map(normalizeGrade)
      .filter((grade) => grade !== null);
    const average = assessments.length
      ? assessments.reduce((sum, grade) => sum + grade, 0) / assessments.length
      : null;
    return { name: subject.name, grade: average === null ? null : Number(average.toFixed(1)) };
  });

  if (!subjects.length) {
    const oldGrades = Array.isArray(student.grades)
      ? student.grades
      : [{ subject: student.subject || allowedSubjects[0], grade: student.grade }];
    subjects = oldGrades.map((entry) => ({
      name: entry.subject || student.subject || allowedSubjects[0],
      grade: normalizeGrade(entry.grade)
    }));
  }

  subjects = subjects.map((subject) => ({
    ...subject,
    name: translateSubjectName(subject.name, className)
  }));
  const demoNoteTranslations = {
    'Excellent participation and strong progress.': 'Pjesëmarrje e shkëlqyeshme dhe përparim i dukshëm.',
    'Improving steadily; complete homework on time.': 'Përparim i vazhdueshëm; dorëzoni detyrat në kohë.',
    'Very consistent, collaborative, and attentive.': 'Shumë e rregullt, bashkëpunuese dhe e vëmendshme.'
  };

  const gradesBySubject = new Map(
    subjects.map((subject) => [subject.name, normalizeGrade(subject.grade)])
  );

  return {
    ...student,
    className,
    teacherNote: demoNoteTranslations[student.teacherNote] || student.teacherNote,
    subjects: allowedSubjects.map((name) => ({
      name,
      grade: gradesBySubject.get(name) ?? null
    }))
  };
}

function getStudents() {
  return studentsCache;
}

async function loadStudents() {
  const rows = await teacherRequest(
    '/rest/v1/students?select=id,class_name,parent_code,record&order=class_name.asc'
  );
  if (!Array.isArray(rows)) {
    throw new Error('Databaza ktheu një listë të pavlefshme të nxënësve.');
  }
  studentsCache = rows.map((row) => {
    if (!row || typeof row.id !== 'string' || typeof row.record !== 'object' || !row.record) {
      throw new Error('Një e dhënë nxënësi në databazë nuk është e vlefshme.');
    }
    return migrateStudent({
      ...row.record,
      id: row.id,
      className: row.class_name,
      parentCode: row.parent_code
    });
  });
  return studentsCache;
}

async function saveStudents(students) {
  if (!students.length) return;
  await teacherRequest('/rest/v1/students?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify(students.map((student) => ({
      id: String(student.id),
      class_name: student.className,
      parent_code: student.parentCode,
      record: student
    })))
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function getTestDates() {
  return testDatesCache;
}

function validateTestDates(parsed) {
  if (!Array.isArray(parsed)) {
    throw new Error('Datat e testeve në databazë nuk janë në formë liste.');
  }
  return parsed.map((test) => {
    if (
      !test ||
      typeof test.id !== 'string' ||
      !isValidDateKey(test.date) ||
      !classes.includes(test.className) ||
      typeof test.subject !== 'string' ||
      typeof test.details !== 'string'
    ) {
      throw new Error('Datat e ruajtura të testeve nuk mund të ngarkoheshin. Kontrolloni hapësirën e ruajtjes dhe rifreskoni faqen.');
    }
    return test;
  });
}

async function loadTestDates() {
  const rows = await teacherRequest(
    '/rest/v1/test_dates?select=id,date,class_name,subject,details&order=date.asc'
  );
  if (!Array.isArray(rows)) {
    throw new Error('Databaza ktheu një listë të pavlefshme të datave të testeve.');
  }
  testDatesCache = validateTestDates(rows.map((row) => ({
    id: row.id,
    date: row.date,
    className: row.class_name,
    subject: row.subject,
    details: row.details || ''
  })));
  return testDatesCache;
}

async function saveTestDate(test) {
  await teacherRequest('/rest/v1/test_dates?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({
      id: test.id,
      date: test.date,
      class_name: test.className,
      subject: test.subject,
      details: test.details
    })
  });
}

async function removeTestDate(id) {
  await teacherRequest(`/rest/v1/test_dates?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

function formatTestDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${weekdayNamesSq[date.getDay()]}, ${day} ${monthNamesSq[month - 1]} ${year}`;
}

function renderCalendar() {
  const tests = getTestDates();
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
  const todayKey = dateKey(new Date());

  const monthName = monthNamesSq[month];
  calendarMonthLabel.textContent = `${monthName[0].toLocaleUpperCase('sq-AL')}${monthName.slice(1)} ${year}`;

  calendarDays.innerHTML = Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstDayOffset + 1;
    if (day < 1 || day > daysInMonth) {
      return '<div class="calendar-day calendar-day-empty" aria-hidden="true"></div>';
    }

    const value = dateKey(new Date(year, month, day));
    const dayTests = tests.filter((test) => test.date === value);
    const visibleTests = dayTests.slice(0, 2);
    return `
      <div class="calendar-day${value === todayKey ? ' is-today' : ''}">
        <span class="calendar-day-number">${day}</span>
        ${visibleTests.map((test) => `
          <span class="calendar-event" title="${escapeHtml(`${test.subject} · Klasa ${test.className}`)}">
            ${escapeHtml(test.subject)} · ${escapeHtml(test.className)}
          </span>
        `).join('')}
        ${dayTests.length > visibleTests.length
          ? `<span class="calendar-more">+${dayTests.length - visibleTests.length} të tjera</span>`
          : ''}
      </div>
    `;
  }).join('');

  const upcomingTests = tests
    .filter((test) => test.date >= todayKey)
    .sort((first, second) =>
      first.date.localeCompare(second.date) ||
      first.className.localeCompare(second.className) ||
      first.subject.localeCompare(second.subject)
    );
  upcomingTestList.innerHTML = upcomingTests.length
    ? upcomingTests.map((test) => `
        <article class="test-event">
          <div>
            <time datetime="${escapeHtml(test.date)}">${escapeHtml(formatTestDate(test.date))}</time>
            <h4>${escapeHtml(translateSubjectName(test.subject, test.className))} <span>· Klasa ${escapeHtml(test.className)}</span></h4>
            ${test.details ? `<p>${escapeHtml(test.details)}</p>` : ''}
          </div>
          <button class="delete-btn remove-test" type="button" data-id="${escapeHtml(test.id)}" aria-label="Hiq testin ${escapeHtml(test.subject)} për klasën ${escapeHtml(test.className)}">×</button>
        </article>
      `).join('')
    : '<p class="empty-state">Nuk ka data të ardhshme testesh. Shtoni më sipër një test për klasën.</p>';
}

function renderRemarkOptions(selectedRemark) {
  return remarks.map((remark) => `
    <option value="${escapeHtml(remark)}" ${remark === selectedRemark ? 'selected' : ''}>
      ${escapeHtml(remarkLabels[remark] || remark)}
    </option>
  `).join('');
}

function renderStudents() {
  const selectedClass = classFilter.value;
  if (!selectedClass) {
    studentCount.textContent = 'Zgjidhni një klasë';
    gradebookHead.innerHTML = '';
    studentTableBody.innerHTML = '<tr><td><div class="empty-state">Zgjidhni një klasë për të hapur regjistrin e notave sipas lëndëve.</div></td></tr>';
    return;
  }

  const subjects = getSubjectsForClass(selectedClass);
  const students = getStudents().filter((student) => student.className === selectedClass);
  studentCount.textContent = `${students.length} nxënës`;

  gradebookHead.innerHTML = `
    <tr>
      <th>Nr.</th>
      <th>Emri i nxënësit</th>
      ${subjects.map((subject) => `<th>${escapeHtml(subject)}</th>`).join('')}
      <th>Mungesat</th>
      <th>Kodi i prindit</th>
      <th>Vlerësimi / shënimi</th>
      <th>Veprimi</th>
    </tr>
  `;

  if (!students.length) {
    studentTableBody.innerHTML = `<tr><td colspan="${subjects.length + 6}"><div class="empty-state">Nuk ka ende nxënës në klasën ${escapeHtml(selectedClass)}. Shtoni nxënësit duke përdorur formularin më sipër.</div></td></tr>`;
    return;
  }

  studentTableBody.innerHTML = students.map((student, index) => {
    const studentGrades = new Map(student.subjects.map((subject) => [subject.name, subject.grade]));
    return `
      <tr>
        <td class="row-number">${index + 1}</td>
        <td class="student-name-cell"><strong>${escapeHtml(student.name)}</strong></td>
        ${subjects.map((subject) => `
          <td class="grade-cell">
            <input
              class="subject-grade"
              type="number"
              min="1"
              max="5"
              step="1"
              inputmode="numeric"
              aria-label="Nota në ${escapeHtml(subject)} për ${escapeHtml(student.name)}"
              data-id="${escapeHtml(student.id)}"
              data-subject="${escapeHtml(subject)}"
              value="${studentGrades.get(subject) ?? ''}"
            />
          </td>
        `).join('')}
        <td class="student-meta-cell">
          <input class="student-edit absence-input" type="number" min="0" max="30" value="${Number(student.absenceCount) || 0}" aria-label="Mungesat e ${escapeHtml(student.name)}" data-id="${escapeHtml(student.id)}" data-field="absenceCount" />
        </td>
        <td class="student-meta-cell parent-code-cell">${escapeHtml(student.parentCode)}</td>
        <td class="student-meta-cell notes-cell">
          <select class="student-edit remark-input" aria-label="Vlerësimi i mësuesit për ${escapeHtml(student.name)}" data-id="${escapeHtml(student.id)}" data-field="remark">
            ${renderRemarkOptions(student.remark)}
          </select>
          <textarea class="student-edit note-input" rows="2" aria-label="Shënimi i mësuesit për ${escapeHtml(student.name)}" data-id="${escapeHtml(student.id)}" data-field="teacherNote">${escapeHtml(student.teacherNote || '')}</textarea>
        </td>
        <td class="student-meta-cell">
          <button class="delete-btn" type="button" data-id="${escapeHtml(student.id)}" aria-label="Fshi nxënësin ${escapeHtml(student.name)}">×</button>
        </td>
      </tr>
    `;
  }).join('');
}

function setNextParentCode() {
  parentCodeInput.value = getUniqueCode(getStudents().map((student) => student.parentCode));
}

function setTeacherAccess(session) {
  teacherSession = session;
  const signedIn = Boolean(session);
  teacherLoginForm.hidden = signedIn;
  teacherSignedIn.hidden = !signedIn;
  teacherWorkspace.hidden = !signedIn;
  document.getElementById('test-calendar').hidden = !signedIn;
  document.getElementById('student-table').hidden = !signedIn;
  localImportPanel.hidden = !signedIn;
  importLocalDataButton.hidden = !localStorage.getItem(STORAGE_KEY);
  if (signedIn) {
    teacherIdentity.textContent = session.user?.email || 'Mësues';
    setNextParentCode();
  } else {
    studentsCache = [];
    testDatesCache = [];
    dataIsLoaded = false;
  }
}

async function loadTeacherData() {
  await Promise.all([loadStudents(), loadTestDates()]);
  dataIsLoaded = true;
  classFilter.value = '';
  renderStudents();
  renderCalendar();
  setNextParentCode();
  setTeacherAccess(teacherSession);
}

async function initializeTeacherApp() {
  try {
    getSupabaseConfig();
    teacherSession = await getTeacherSession();
    if (teacherSession) {
      await loadTeacherData();
    } else {
      setTeacherAccess(null);
    }
  } catch (error) {
    console.error('Nuk u lidh regjistri me databazën online:', error);
    teacherAuthMessage.textContent = error.message;
  }
}

teacherLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  teacherAuthMessage.textContent = '';
  const button = document.getElementById('teacherLoginButton');
  button.disabled = true;
  try {
    teacherSession = await signIn(
      document.getElementById('teacherEmail').value.trim(),
      document.getElementById('teacherPassword').value
    );
    await loadTeacherData();
    teacherAuthMessage.textContent = '';
  } catch (error) {
    console.error('Hyrja e mësuesit dështoi:', error);
    teacherAuthMessage.textContent = `Hyrja ose ngarkimi i të dhënave dështoi: ${error.message}`;
    setTeacherAccess(null);
  } finally {
    button.disabled = false;
  }
});

teacherLogoutButton.addEventListener('click', async () => {
  teacherAuthMessage.textContent = '';
  try {
    await signOut();
    setTeacherAccess(null);
    teacherAuthMessage.textContent = 'Keni dalë nga llogaria.';
  } catch (error) {
    console.error('Dalja nga llogaria dështoi:', error);
    teacherAuthMessage.textContent = `Nuk u krye dalja nga llogaria: ${error.message}`;
    setTeacherAccess(null);
  }
});

async function importTeacherData(students, testDates) {
  if (!Array.isArray(students) || students.some((student) => !student || typeof student !== 'object')) {
    throw new Error('Të dhënat e nxënësve nuk janë në formatin e duhur.');
  }
  const validTestDates = validateTestDates(testDates);
  if (!students.length && !validTestDates.length) {
    throw new Error('Nuk u gjetën nxënës ose data testesh për t’u importuar.');
  }

  await saveStudents(students.map(migrateStudent));
  for (const test of validTestDates) {
    await saveTestDate(test);
  }
  await loadTeacherData();
}

importLocalDataButton.addEventListener('click', async () => {
  importLocalDataButton.disabled = true;
  teacherAuthMessage.textContent = '';
  try {
    const storedStudents = localStorage.getItem(STORAGE_KEY);
    const storedTests = localStorage.getItem(TEST_DATES_KEY);
    const localStudents = storedStudents ? JSON.parse(storedStudents) : [];
    const localTests = storedTests ? JSON.parse(storedTests) : [];
    await importTeacherData(localStudents, localTests);
    teacherAuthMessage.textContent = 'Të dhënat lokale u importuan në databazën e përbashkët.';
  } catch (error) {
    console.error('Importimi i të dhënave lokale dështoi:', error);
    teacherAuthMessage.textContent = `Importimi dështoi: ${error.message}`;
  } finally {
    importLocalDataButton.disabled = false;
  }
});

localImportFileInput.addEventListener('change', () => {
  importFileDataButton.disabled = !localImportFileInput.files?.length;
});

importFileDataButton.addEventListener('click', async () => {
  const file = localImportFileInput.files?.[0];
  if (!file) return;

  importFileDataButton.disabled = true;
  teacherAuthMessage.textContent = '';
  try {
    const importedData = JSON.parse(await file.text());
    if (!importedData || typeof importedData !== 'object') {
      throw new Error('Skedari nuk përmban të dhëna të vlefshme.');
    }
    await importTeacherData(importedData.students, importedData.testDates);
    localImportFileInput.value = '';
    teacherAuthMessage.textContent = 'Skedari u importua në databazën e përbashkët.';
  } catch (error) {
    console.error('Importimi i skedarit dështoi:', error);
    teacherAuthMessage.textContent = `Importimi dështoi: ${error.message}`;
  } finally {
    importFileDataButton.disabled = !localImportFileInput.files?.length;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';
  const name = nameInput.value.trim();
  if (!name || !dataIsLoaded) return;

  const students = getStudents();
  const alreadyExists = students.some((student) =>
    student.className === classInput.value &&
    student.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  if (alreadyExists) {
    formMessage.textContent = `${name} është tashmë në klasën ${classInput.value}.`;
    return;
  }

  const className = classInput.value;
  const classSubjects = getSubjectsForClass(className);
  const student = {
    id: crypto.randomUUID(),
    name,
    className,
    subjects: classSubjects.map((subject) => ({ name: subject, grade: null })),
    remark: remarkInput.value,
    absenceCount: Number(absenceInput.value),
    parentCode: parentCodeInput.value || getUniqueCode(students.map((item) => item.parentCode)),
    teacherNote: noteInput.value.trim()
  };

  try {
    await saveStudents([student]);
    studentsCache.push(student);
    classFilter.value = className;
    form.reset();
    classInput.value = className;
    setNextParentCode();
    renderStudents();
    formMessage.textContent = `${name} u shtua në klasën ${className}.`;
  } catch (error) {
    console.error('Nuk u ruajt nxënësi në databazën online:', error);
    formMessage.textContent = `Nxënësi nuk u ruajt: ${error.message}`;
  }
});

testDateInput.min = dateKey(new Date());
testDateInput.value = dateKey(new Date());

testCalendarForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  calendarMessage.textContent = '';

  const date = testDateInput.value;
  const className = testClassInput.value;
  const subject = testSubjectInput.value.trim();
  const details = testDetailsInput.value.trim();
  if (!isValidDateKey(date) || date < dateKey(new Date())) {
    calendarMessage.textContent = 'Zgjidhni sot ose një datë të ardhshme për testin.';
    return;
  }
  if (!classes.includes(className) || !subject) {
    calendarMessage.textContent = 'Zgjidhni klasën dhe shkruani lëndën e testit.';
    return;
  }

  const tests = getTestDates();
  const alreadyExists = tests.some((test) =>
    test.date === date &&
    test.className === className &&
    test.subject.toLocaleLowerCase() === subject.toLocaleLowerCase()
  );
  if (alreadyExists) {
    calendarMessage.textContent = `Një test në lëndën ${subject} është planifikuar tashmë për klasën ${className} në këtë datë.`;
    return;
  }

  const test = {
    id: crypto.randomUUID(),
    date,
    className,
    subject,
    details
  };
  try {
    await saveTestDate(test);
    testDatesCache.push(test);
    displayedMonth.setFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1);
    testSubjectInput.value = '';
    testDetailsInput.value = '';
    renderCalendar();
    calendarMessage.textContent = `Data e testit u shtua për klasën ${className}.`;
  } catch (error) {
    console.error('Nuk u ruajt data e testit në databazën online:', error);
    calendarMessage.textContent = `Data e testit nuk u ruajt: ${error.message}`;
  }
});

document.getElementById('previousMonth').addEventListener('click', () => {
  displayedMonth.setMonth(displayedMonth.getMonth() - 1);
  renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  displayedMonth.setMonth(displayedMonth.getMonth() + 1);
  renderCalendar();
});

upcomingTestList.addEventListener('click', async (event) => {
  const button = event.target.closest('.remove-test');
  if (!button) return;

  const test = getTestDates().find((item) => item.id === button.dataset.id);
  if (!test || !window.confirm(`Të hiqet testi ${test.subject} për klasën ${test.className}?`)) return;
  try {
    await removeTestDate(test.id);
    testDatesCache = testDatesCache.filter((item) => item.id !== test.id);
    renderCalendar();
    calendarMessage.textContent = 'Data e testit u hoq.';
  } catch (error) {
    console.error('Nuk u hoq data e testit nga databaza online:', error);
    calendarMessage.textContent = `Data e testit nuk u hoq: ${error.message}`;
  }
});

classFilter.addEventListener('change', renderStudents);

studentTableBody.addEventListener('change', async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) {
    return;
  }

  const student = getStudents().find((item) => item.id === input.dataset.id);
  if (!student) return;

  if (input.classList.contains('subject-grade')) {
    if (input.value !== '' && !input.validity.valid) {
      input.reportValidity();
      return;
    }
    const subject = student.subjects.find((item) => item.name === input.dataset.subject);
    if (subject) subject.grade = input.value === '' ? null : Number(input.value);
  } else if (input.dataset.field === 'absenceCount') {
    if (!input.validity.valid) {
      input.reportValidity();
      return;
    }
    student.absenceCount = Number(input.value);
  } else if (input.dataset.field === 'remark') {
    student.remark = input.value;
  } else if (input.dataset.field === 'teacherNote') {
    student.teacherNote = input.value.trim();
  } else {
    return;
  }

  try {
    await saveStudents([student]);
    formMessage.textContent = 'Ndryshimet u ruajtën.';
  } catch (error) {
    console.error('Nuk u ruajtën ndryshimet e nxënësit:', error);
    formMessage.textContent = `Ndryshimet nuk u ruajtën: ${error.message}`;
  }
});

studentTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('.delete-btn');
  if (!button) return;

  const student = getStudents().find((item) => item.id === button.dataset.id);
  if (!student || !window.confirm(`Të fshihen të dhënat e klasës për ${student.name}?`)) return;
  try {
    await teacherRequest(`/rest/v1/students?id=eq.${encodeURIComponent(student.id)}`, {
      method: 'DELETE'
    });
    studentsCache = studentsCache.filter((item) => item.id !== student.id);
    renderStudents();
  } catch (error) {
    console.error('Nuk u fshi nxënësi nga databaza online:', error);
    formMessage.textContent = `Nxënësi nuk u fshi: ${error.message}`;
  }
});

classInput.addEventListener('change', () => {
  classFilter.value = classInput.value;
  renderStudents();
});

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !teacherSession || !dataIsLoaded) return;
  try {
    await Promise.all([loadStudents(), loadTestDates()]);
    renderStudents();
    renderCalendar();
  } catch (error) {
    console.error('Nuk u rifreskuan të dhënat nga databaza online:', error);
    teacherAuthMessage.textContent = `Të dhënat nuk u rifreskuan: ${error.message}`;
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.error('Aplikacioni nuk mund të regjistrojë service worker:', error);
  });
}

initializeTeacherApp();
