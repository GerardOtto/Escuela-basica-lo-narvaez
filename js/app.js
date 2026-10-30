/* Plataforma de notas · Escuela Básica Lo Narváez
 * Aplicación 100 % en el navegador: los datos se guardan en localStorage
 * y se pueden respaldar (.json) o exportar a Excel (.xlsx con fórmulas).
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'lonarvaez-notas-v1';
  const MIN_COLS = 7;          // columnas de notas visibles por defecto (como la planilla original)
  const GRADE_MIN = 10;
  const GRADE_MAX = 70;
  const PASS_MARK = 40;

  const DEFAULT_SUBJECTS = [
    'Lenguaje y Comunicación',
    'Idioma Extranjero Inglés',
    'Matemáticas',
    'Historia, Geografía y Cs. Sociales',
    'Ciencias Naturales',
    'Taller Medio Ambiente',
    'Tecnología',
    'Artes Musicales',
    'Artes Visuales',
    'Educación Física y Salud',
    'Taller Vida Sana',
    'Orientación',
  ];

  const SCHOOL = {
    slep: 'Servicio Local de Educación Pública Marga Marga',
    name: 'Escuela Básica Lo Narváez',
    rbd: 'RBD 1491-5',
  };

  /** Orientación y talleres: asignaturas cuya inclusión en el promedio final es opcional. */
  const isOptional = (s) => s.optional ?? /orientaci|taller/i.test(s.name);

  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  let state = load();
  let saveTimer = null;

  /* ====================== Datos ====================== */

  function newCourse(name, teacher) {
    return {
      id: uid(),
      name,
      teacher: teacher || '',
      subjects: DEFAULT_SUBJECTS.map((n) => ({ id: uid(), name: n, inAverage: !isOptional({ name: n }) })),
      students: [],
      grades: {},   // grades[subjectId][studentId] = [n1, n2, null, ...]
      cols: {},     // cols[subjectId] = cantidad de columnas visibles
    };
  }

  function demoState() {
    const course = newCourse('5° Año Básico', 'Esteban Toledo Ahumada');
    const names = [
      'Alarcón Muñoz, Valentina', 'Bravo Soto, Matías', 'Castillo Rojas, Isidora', 'Díaz Fuentes, Benjamín',
      'Espinoza Vera, Florencia', 'González Pérez, Agustín', 'Herrera Silva, Martina', 'Jara Contreras, Tomás',
      'López Navarro, Emilia', 'Morales Tapia, Joaquín',
    ];
    // Generador pseudoaleatorio determinístico para que el ejemplo sea siempre igual
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    course.students = names.map((n, i) => ({
      id: uid(), name: n, rut: '', attendance: Math.round(82 + rnd() * 17), obs: i === 0 ? 'Estudiante de ejemplo.' : '',
    }));
    // Cantidad distinta de notas por asignatura para mostrar el promedio flexible
    const counts = [4, 4, 4, 2, 3, 0, 2, 2, 1, 0, 0, 0];
    course.subjects.forEach((s, si) => {
      course.grades[s.id] = {};
      course.students.forEach((st) => {
        const base = 35 + rnd() * 30;
        const arr = [];
        for (let k = 0; k < counts[si]; k++) {
          // algunos estudiantes con notas pendientes
          arr.push(rnd() < 0.08 ? null : Math.max(GRADE_MIN, Math.min(GRADE_MAX, Math.round(base + (rnd() - 0.5) * 20))));
        }
        course.grades[s.id][st.id] = arr;
      });
    });
    return {
      version: 1,
      config: { year: new Date().getFullYear(), semester: 'Segundo', director: 'Mireya Quiroz Rodríguez', decimals: 0 },
      courses: [course],
      currentCourse: course.id,
      currentTab: course.subjects[0].id,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.courses)) return data;
      }
    } catch (e) { /* almacenamiento no disponible: se usa el ejemplo */ }
    return demoState();
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (e) { toast('No se pudo guardar en este navegador. Descarga un respaldo.'); }
    }, 150);
  }

  const course = () => state.courses.find((c) => c.id === state.currentCourse) || state.courses[0];

  function gradesOf(c, subjId, studId) {
    c.grades[subjId] ??= {};
    return (c.grades[subjId][studId] ??= []);
  }

  function colCount(c, subjId) {
    let n = c.cols[subjId] ?? MIN_COLS;
    for (const st of c.students) n = Math.max(n, (c.grades[subjId]?.[st.id] || []).length);
    return n;
  }

  /* ====================== Cálculos ====================== */

  function roundTo(v, d) {
    const f = 10 ** d;
    return Math.round((v + Number.EPSILON) * f) / f;
  }

  /** Promedio solo de las notas ingresadas (ignora celdas vacías). */
  function mean(values) {
    const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function subjectAvg(c, subjId, studId) {
    const m = mean(c.grades[subjId]?.[studId] || []);
    return m === null ? null : roundTo(m, state.config.decimals);
  }

  /** Promedio final = promedio de los promedios de cada asignatura (solo las que tienen notas). */
  function finalAvg(c, studId) {
    const avgs = c.subjects.filter((s) => s.inAverage).map((s) => subjectAvg(c, s.id, studId));
    const m = mean(avgs);
    return m === null ? null : roundTo(m, state.config.decimals);
  }

  function fmt(v, d = state.config.decimals) {
    if (v === null || v === undefined || v === '') return '';
    return Number(v).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  const fmtGrade = (v) => (v === null || v === undefined ? '' : fmt(v, Number.isInteger(v) ? 0 : 1));
  const cls = (v) => (v === null ? 'empty' : v < PASS_MARK ? 'fail' : 'pass');

  /** Acepta 10–70, o 1,0–7,0 (que se convierte a 10–70). Devuelve número, null (vacío) o NaN (inválido). */
  function parseGrade(text) {
    const t = String(text).trim().replace(',', '.');
    if (t === '') return null;
    if (!/^\d{1,2}(\.\d+)?$/.test(t)) return NaN;
    let v = parseFloat(t);
    if (v >= 1 && v <= 7) v *= 10;
    v = roundTo(v, 1);
    return v >= GRADE_MIN && v <= GRADE_MAX ? v : NaN;
  }

  /* ====================== Interfaz general ====================== */

  function render() {
    const c = course();
    if (!c) { renderNoCourse(); return; }
    state.currentCourse = c.id;
    const validTabs = ['alumnos', 'concentracion', ...c.subjects.map((s) => s.id)];
    if (!validTabs.includes(state.currentTab)) state.currentTab = c.subjects[0]?.id || 'alumnos';
    renderCourseSelect();
    renderTabs();
    renderSheet();
  }

  function renderNoCourse() {
    $('#courseSelect').innerHTML = '';
    $('#tabs').innerHTML = '';
    $('#sheetTitle').textContent = 'Sin cursos';
    $('#sheetMeta').textContent = '';
    $('#sheetActions').innerHTML = '';
    $('#sheetHint').textContent = '';
    $('#sheetWrap').innerHTML = '<div class="empty-state"><strong>No hay cursos creados</strong>Usa el botón «+ Curso» para comenzar.</div>';
  }

  function renderCourseSelect() {
    $('#courseSelect').innerHTML = state.courses
      .map((c) => `<option value="${c.id}" ${c.id === state.currentCourse ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('');
  }

  function renderTabs() {
    const c = course();
    const tab = (id, label, extra = '') =>
      `<button class="tab ${extra} ${state.currentTab === id ? 'active' : ''}" data-tab="${id}">${esc(label)}</button>`;
    $('#tabs').innerHTML =
      tab('alumnos', 'Estudiantes', 'special') +
      '<span class="tab-sep"></span>' +
      c.subjects.map((s) => tab(s.id, s.name)).join('') +
      '<span class="tab-sep"></span>' +
      tab('concentracion', 'Concentración de notas', 'concentracion');
    $('#tabs .tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function periodLabel() {
    return `${state.config.semester} semestre ${state.config.year}`;
  }

  function renderSheet() {
    const c = course();
    $('#sheetBar').hidden = true;
    $('#sheetBar').innerHTML = '';
    if (state.currentTab === 'alumnos') renderStudents(c);
    else if (state.currentTab === 'concentracion') renderConcentration(c);
    else renderSubject(c, c.subjects.find((s) => s.id === state.currentTab));
  }

  function noStudentsHtml() {
    return '<div class="empty-state"><strong>Este curso aún no tiene estudiantes</strong>Agrégalos en la pestaña «Estudiantes».</div>';
  }

  /* ====================== Planilla de asignatura ====================== */

  function renderSubject(c, subj) {
    $('#sheetTitle').textContent = subj.name;
    $('#sheetMeta').textContent = `${c.name} · ${periodLabel()}${c.teacher ? ' · Profesor(a) jefe: ' + c.teacher : ''}`;
    $('#sheetActions').innerHTML = `
      <button class="btn ghost" data-act="addCol">+ Agregar columna de nota</button>`;
    $('#sheetHint').textContent =
      'Escala 10 a 70 (también puedes escribir 1,0 a 7,0). El promedio considera solo las notas ingresadas. ' +
      'Navega con Enter y las flechas; puedes pegar un bloque de notas copiado desde Excel.';

    if (!c.students.length) { $('#sheetWrap').innerHTML = noStudentsHtml(); return; }

    const n = colCount(c, subj.id);
    let html = '<table class="grid"><thead><tr><th class="num">N°</th><th class="name">Nombre del estudiante</th>';
    for (let k = 0; k < n; k++) {
      const canDel = n > 1;
      html += `<th class="cell"><div class="col-tools">Nota ${k + 1}${canDel ? `<button class="col-del" data-delcol="${k}" title="Eliminar columna Nota ${k + 1}">✕</button>` : ''}</div></th>`;
    }
    html += '<th class="avg">Promedio</th></tr></thead><tbody>';
    c.students.forEach((st, r) => {
      const g = c.grades[subj.id]?.[st.id] || [];
      html += `<tr><td class="num">${r + 1}</td><td class="name">${esc(st.name)}</td>`;
      for (let k = 0; k < n; k++) {
        html += `<td class="cell"><input inputmode="decimal" autocomplete="off" data-r="${r}" data-c="${k}" value="${fmtGrade(g[k])}" aria-label="${esc(st.name)}, nota ${k + 1}"></td>`;
      }
      const a = subjectAvg(c, subj.id, st.id);
      html += `<td class="avg ${cls(a)}" data-avg="${r}">${fmt(a)}</td></tr>`;
    });
    html += '</tbody><tfoot><tr><td class="num"></td><td class="name">Promedio del curso</td>';
    for (let k = 0; k < n; k++) html += `<td data-colavg="${k}"></td>`;
    html += '<td class="avg" data-colavg="avg"></td></tr></tfoot></table>';
    $('#sheetWrap').innerHTML = html;
    updateSubjectFooter(c, subj);
  }

  function updateSubjectFooter(c, subj) {
    const n = colCount(c, subj.id);
    for (let k = 0; k < n; k++) {
      const m = mean(c.students.map((st) => c.grades[subj.id]?.[st.id]?.[k]));
      const td = $(`[data-colavg="${k}"]`);
      if (td) { td.textContent = m === null ? '' : fmt(roundTo(m, 1), 1); td.className = cls(m); }
    }
    const m = mean(c.students.map((st) => subjectAvg(c, subj.id, st.id)));
    const td = $('[data-colavg="avg"]');
    if (td) { td.textContent = m === null ? '' : fmt(roundTo(m, 1), 1); td.className = 'avg ' + cls(m); }
  }

  function setGrade(c, subj, r, k, value) {
    const st = c.students[r];
    const g = gradesOf(c, subj.id, st.id);
    while (g.length <= k) g.push(null);
    g[k] = value;
    while (g.length && g[g.length - 1] === null) g.pop();
  }

  function refreshRowAvg(c, subj, r) {
    const td = $(`[data-avg="${r}"]`);
    if (!td) return;
    const a = subjectAvg(c, subj.id, c.students[r].id);
    td.textContent = fmt(a);
    td.className = 'avg ' + cls(a);
  }

  function deleteColumn(c, subj, k) {
    const has = c.students.some((st) => c.grades[subj.id]?.[st.id]?.[k] != null);
    if (has && !confirm(`La columna «Nota ${k + 1}» tiene notas ingresadas. ¿Eliminarla de todas formas?`)) return;
    const n = colCount(c, subj.id);
    for (const st of c.students) {
      const g = c.grades[subj.id]?.[st.id];
      if (g && g.length > k) g.splice(k, 1);
    }
    c.cols[subj.id] = Math.max(1, n - 1);
    save(); renderSheet();
  }

  /* ====================== Estudiantes ====================== */

  function renderStudents(c) {
    $('#sheetTitle').textContent = 'Estudiantes';
    $('#sheetMeta').textContent = `${c.name} · ${c.students.length} estudiante(s) · ${periodLabel()}`;
    $('#sheetActions').innerHTML = `
      <button class="btn" data-act="addStudents">+ Agregar estudiantes</button>
      <button class="btn ghost" data-act="sortStudents">Ordenar A–Z</button>`;
    $('#sheetHint').textContent =
      'Los datos se guardan automáticamente en este navegador. Descarga un respaldo periódicamente (menú «Más»).';

    if (!c.students.length) {
      $('#sheetWrap').innerHTML = '<div class="empty-state"><strong>Sin estudiantes</strong>Presiona «+ Agregar estudiantes» para ingresar la nómina del curso.</div>';
      return;
    }
    let html = `<table class="grid"><thead><tr><th class="num">N°</th><th class="name">Nombre del estudiante</th>
      <th style="width:140px">RUT</th><th style="width:110px">Asistencia %</th><th style="min-width:320px">Observaciones (informe)</th>
      <th style="width:190px">Acciones</th></tr></thead><tbody>`;
    c.students.forEach((st, r) => {
      html += `<tr><td class="num">${r + 1}</td>
        <td class="name text"><input data-field="name" data-r="${r}" value="${esc(st.name)}" aria-label="Nombre"></td>
        <td class="text"><input data-field="rut" data-r="${r}" value="${esc(st.rut)}" placeholder="12345678-9" aria-label="RUT"></td>
        <td class="cell"><input data-field="attendance" data-r="${r}" inputmode="decimal" value="${st.attendance ?? ''}" aria-label="Asistencia"></td>
        <td class="text"><input data-field="obs" data-r="${r}" value="${esc(st.obs)}" aria-label="Observaciones"></td>
        <td><div class="row-actions">
          <button class="icon-btn" data-report="${r}">Informe</button>
          <button class="icon-btn" data-move="${r}:-1" title="Subir">↑</button>
          <button class="icon-btn" data-move="${r}:1" title="Bajar">↓</button>
          <button class="icon-btn del" data-delstudent="${r}" title="Eliminar">Eliminar</button>
        </div></td></tr>`;
    });
    html += '</tbody></table>';
    $('#sheetWrap').innerHTML = html;
  }

  function addStudentsDialog() {
    openDialog('Agregar estudiantes', `
      <div class="form-grid">
        <label class="full">Un estudiante por línea. Opcionalmente agrega el RUT separado por punto y coma o tabulación
          (puedes pegar dos columnas desde Excel).
          <textarea name="list" placeholder="Apellido Apellido, Nombre ; 12345678-9" required></textarea>
        </label>
      </div>`, (form) => {
      const c = course();
      const lines = form.list.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const [name, rut = ''] = line.split(/\t|;/).map((x) => x.trim());
        if (name) c.students.push({ id: uid(), name, rut, attendance: null, obs: '' });
      }
      toast(`${lines.length} estudiante(s) agregados`);
      save(); render();
    }, 'Agregar');
  }

  /* ====================== Concentración ====================== */

  function renderConcentration(c) {
    $('#sheetTitle').textContent = 'Concentración de notas';
    $('#sheetMeta').textContent = `${c.name} · ${periodLabel()}`;
    $('#sheetActions').innerHTML = `
      <button class="btn ghost" data-act="printConc">Imprimir lámina</button>
      <button class="btn ghost" data-act="printAll">Imprimir informes</button>`;
    const optional = c.subjects.filter(isOptional);
    if (optional.length) {
      $('#sheetBar').hidden = false;
      $('#sheetBar').innerHTML = '<span class="bar-label">Incluir en el promedio final:</span>' + optional.map((s) => `
        <label class="switch"><input type="checkbox" data-optional="${s.id}" ${s.inAverage ? 'checked' : ''}>
          <span class="slider" aria-hidden="true"></span>${esc(s.name)}</label>`).join('');
    }
    const excluded = c.subjects.some((s) => !s.inAverage);
    $('#sheetHint').textContent =
      'Promedio final = promedio de los promedios de cada asignatura con notas registradas.' +
      (excluded ? ' (*) Asignatura que no se considera en el promedio final.' : '');
    if (!c.students.length) { $('#sheetWrap').innerHTML = noStudentsHtml(); return; }
    $('#sheetWrap').innerHTML = concentrationTable(c, true);
  }

  function concentrationTable(c, interactive) {
    let html = `<table class="${interactive ? 'grid' : 'rep conc'}"><thead><tr><th class="num">N°</th><th class="name">Nombre del estudiante</th>`;
    for (const s of c.subjects) {
      html += `<th class="vhead ${s.inAverage ? '' : 'excluded'}" title="${esc(s.name)}"><span>${esc(s.name)}</span></th>`;
    }
    html += '<th class="final">Promedio final</th><th class="vhead"><span>Asistencia %</span></th></tr></thead><tbody>';
    c.students.forEach((st, r) => {
      html += `<tr><td class="num">${r + 1}</td><td class="name s">${esc(st.name)}</td>`;
      for (const s of c.subjects) {
        const a = subjectAvg(c, s.id, st.id);
        html += `<td class="${cls(a)}">${fmt(a)}</td>`;
      }
      const f = finalAvg(c, st.id);
      html += `<td class="final ${cls(f)}">${fmt(f)}</td><td>${st.attendance ?? ''}</td></tr>`;
    });
    html += '</tbody><tfoot><tr><td class="num"></td><td class="name s">Promedio del curso</td>';
    for (const s of c.subjects) {
      const m = mean(c.students.map((st) => subjectAvg(c, s.id, st.id)));
      html += `<td class="${cls(m)}">${m === null ? '' : fmt(roundTo(m, 1), 1)}</td>`;
    }
    const mf = mean(c.students.map((st) => finalAvg(c, st.id)));
    const ma = mean(c.students.map((st) => st.attendance));
    html += `<td class="final ${cls(mf)}">${mf === null ? '' : fmt(roundTo(mf, 1), 1)}</td><td>${ma === null ? '' : fmt(roundTo(ma, 1), 1)}</td></tr></tfoot></table>`;
    return html;
  }

  /* ====================== Impresión ====================== */

  function printWith(html, landscape) {
    $('#printArea').innerHTML = html;
    let style = null;
    if (landscape) {
      style = document.createElement('style');
      style.textContent = '@page { size: letter landscape; margin: 10mm; }';
      document.head.appendChild(style);
    }
    const imgs = [...$('#printArea').querySelectorAll('img')];
    Promise.all(imgs.map((img) => (img.complete ? null : new Promise((res) => { img.onload = img.onerror = res; }))))
      .then(() => {
        window.print();
        setTimeout(() => { $('#printArea').innerHTML = ''; style?.remove(); }, 500);
      });
  }

  function reportHtml(c, st) {
    const n = Math.max(MIN_COLS, ...c.subjects.map((s) => (c.grades[s.id]?.[st.id] || []).length));
    let rows = '';
    for (const s of c.subjects) {
      const g = c.grades[s.id]?.[st.id] || [];
      rows += `<tr><td class="s">${esc(s.name)}</td>`;
      for (let k = 0; k < n; k++) rows += `<td>${fmtGrade(g[k])}</td>`;
      rows += `<td class="p">${fmt(subjectAvg(c, s.id, st.id))}</td></tr>`;
    }
    const heads = Array.from({ length: n }, (_, k) => `<th class="gcol">${k + 1}</th>`).join('');
    return `
      <section class="report">
        <div class="report-head">
          <img src="assets/logo.png" alt="">
          <div class="inst"><b>${esc(SCHOOL.slep.toUpperCase())}</b><b>${esc(SCHOOL.name.toUpperCase())}</b>${esc(SCHOOL.rbd)}</div>
        </div>
        <div class="report-title">
          <b>INFORME DE NOTAS ${esc(state.config.semester.toUpperCase())} SEMESTRE</b><br>
          ${esc(SCHOOL.name.toUpperCase())}<br>${esc(state.config.year)}
        </div>
        <div class="report-data">
          <span class="k">NOMBRE:</span><span>${esc(st.name)}</span><span>${st.rut ? 'RUT ' + esc(st.rut) : ''}</span>
          <span class="k">CURSO:</span><span>${esc(c.name)}</span><span></span>
          <span class="k">PROFESOR JEFE:</span><span>${esc(c.teacher)}</span><span></span>
        </div>
        <table class="rep">
          <thead><tr><th style="text-align:left">ASIGNATURA</th>${heads}<th class="pcol">Promedio</th></tr></thead>
          <tbody>${rows}
            <tr class="gen"><td class="s">Promedio General</td><td colspan="${n}"></td><td class="p">${fmt(finalAvg(c, st.id))}</td></tr>
            <tr class="gen"><td class="s">Porcentaje de asistencia</td><td colspan="${n}"></td><td class="p">${st.attendance != null && st.attendance !== '' ? esc(st.attendance) + '%' : ''}</td></tr>
          </tbody>
        </table>
        <div class="report-obs"><b>Observaciones</b><div>${esc(st.obs)}</div></div>
        <div class="report-sign">
          <div>${esc(c.teacher.toUpperCase())}<span>Profesor Jefe</span></div>
          <div>${esc(state.config.director.toUpperCase())}<span>Directora</span></div>
        </div>
      </section>`;
  }

  function printReports(c, students) {
    if (!students.length) { toast('No hay estudiantes en este curso'); return; }
    printWith(students.map((st) => reportHtml(c, st)).join(''), false);
  }

  function printConcentration(c) {
    if (!c.students.length) { toast('No hay estudiantes en este curso'); return; }
    const html = `
      <section class="report" style="width:auto">
        <div class="report-head">
          <img src="assets/logo.png" alt="" style="height:18mm">
          <div class="inst"><b>${esc(SCHOOL.name.toUpperCase())}</b>${esc(SCHOOL.rbd)} · ${esc(SCHOOL.slep)}</div>
        </div>
        <div class="report-title" style="margin:4mm 0"><b>CONCENTRACIÓN DE NOTAS · ${esc(c.name.toUpperCase())}</b><br>
          ${esc(periodLabel())}${c.teacher ? ' · Profesor(a) jefe: ' + esc(c.teacher) : ''}</div>
        ${concentrationTable(c, false)}
      </section>`;
    printWith(html, true);
  }

  /* ====================== Exportación a Excel ====================== */

  async function exportExcel() {
    if (typeof ExcelJS === 'undefined') { toast('No se pudo cargar el módulo de Excel (revisa la conexión a internet).'); return; }
    const c = course();
    const d = state.config.decimals;
    const wb = new ExcelJS.Workbook();
    wb.creator = SCHOOL.name;
    wb.created = new Date();

    let logoId = null;
    try {
      const buf = await (await fetch('assets/logo.png')).arrayBuffer();
      logoId = wb.addImage({ buffer: buf, extension: 'png' });
    } catch (e) { /* sin logo si se abre como archivo local */ }

    const used = new Set();
    const sheetName = (name) => {
      let base = name.replace(/[\[\]:*?/\\]/g, '').slice(0, 31).trim() || 'Hoja';
      let s = base, i = 2;
      while (used.has(s.toLowerCase())) s = base.slice(0, 28) + ' ' + i++;
      used.add(s.toLowerCase());
      return s;
    };
    const colL = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    const thin = { style: 'thin', color: { argb: 'FFB9C1CF' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const BRAND = 'FF8E1B2B', NAVY = 'FF1F2F57', HEAD = 'FFEEF1F6';
    const FIRST = 6; // primera fila de estudiantes
    const last = FIRST + c.students.length - 1;
    const numFmt = d ? '0.0' : '0';

    function header(ws, title, lastCol) {
      ws.getRow(1).height = 22; ws.getRow(2).height = 20; ws.getRow(3).height = 18; ws.getRow(4).height = 16;
      const L = colL(lastCol);
      ws.mergeCells(`C1:${L}1`); ws.mergeCells(`C2:${L}2`); ws.mergeCells(`C3:${L}3`);
      ws.getCell('C1').value = SCHOOL.name.toUpperCase();
      ws.getCell('C1').font = { bold: true, size: 14, color: { argb: BRAND } };
      ws.getCell('C2').value = title;
      ws.getCell('C2').font = { bold: true, size: 12, color: { argb: NAVY } };
      ws.getCell('C3').value = `${c.name} · ${periodLabel()}${c.teacher ? ' · Profesor(a) jefe: ' + c.teacher : ''}`;
      ws.getCell('C3').font = { size: 10, color: { argb: 'FF667085' } };
      if (logoId !== null) ws.addImage(logoId, { tl: { col: 1.05, row: 0.1 }, ext: { width: 52, height: 68 } });
    }
    function headRow(ws, labels, fills) {
      const row = ws.getRow(FIRST - 1);
      labels.forEach((l, i) => {
        const cell = row.getCell(i + 1);
        cell.value = l;
        cell.font = { bold: true, color: { argb: fills?.[i] ? 'FFFFFFFF' : NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills?.[i] || HEAD } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = border;
      });
      row.height = 24;
    }
    function redBelowPass(ws, ref) {
      ws.addConditionalFormatting({
        ref,
        rules: [
          { type: 'cellIs', operator: 'lessThan', formulae: [PASS_MARK], style: { font: { color: { argb: 'FFC81E1E' }, bold: true } } },
          { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [PASS_MARK], style: { font: { color: { argb: 'FF1D4ED8' } } } },
        ],
      });
    }

    // Una hoja por asignatura: estudiantes en filas, notas en columnas
    const avgRef = {}; // subjectId -> { sheet, col }
    for (const s of c.subjects) {
      const n = colCount(c, s.id);
      const ws = wb.addWorksheet(sheetName(s.name), { views: [{ state: 'frozen', xSplit: 2, ySplit: FIRST - 1 }] });
      ws.columns = [{ width: 5 }, { width: 38 }, ...Array.from({ length: n }, () => ({ width: 8 })), { width: 11 }];
      header(ws, s.name, n + 2);
      headRow(ws, ['N°', 'Nombre del estudiante', ...Array.from({ length: n }, (_, k) => `Nota ${k + 1}`), 'Promedio'],
        { [n + 2]: BRAND });
      const firstG = colL(2), lastG = colL(n + 1), avgCol = colL(n + 2);
      c.students.forEach((st, i) => {
        const r = FIRST + i;
        const row = ws.getRow(r);
        row.getCell(1).value = i + 1;
        row.getCell(2).value = st.name;
        const g = c.grades[s.id]?.[st.id] || [];
        for (let k = 0; k < n; k++) row.getCell(k + 3).value = g[k] ?? null;
        const res = subjectAvg(c, s.id, st.id);
        row.getCell(n + 3).value = {
          formula: `IF(COUNT(${firstG}${r}:${lastG}${r})=0,"",ROUND(AVERAGE(${firstG}${r}:${lastG}${r}),${d}))`,
          result: res ?? '',
        };
        for (let k = 1; k <= n + 3; k++) {
          const cell = row.getCell(k);
          cell.border = border;
          cell.alignment = { horizontal: k === 2 ? 'left' : 'center', vertical: 'middle' };
        }
        row.getCell(1).font = { color: { argb: 'FF667085' } };
        row.getCell(n + 3).font = { bold: true };
        row.getCell(n + 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7E9EB' } };
        row.getCell(n + 3).numFmt = numFmt;
      });
      if (c.students.length) {
        redBelowPass(ws, `${firstG}${FIRST}:${avgCol}${last}`);
        ws.dataValidations.add(`${firstG}${FIRST}:${lastG}${last}`, {
          type: 'decimal', operator: 'between', formulae: [GRADE_MIN, GRADE_MAX], allowBlank: true,
          showErrorMessage: true, errorTitle: 'Nota inválida', error: `Ingrese una nota entre ${GRADE_MIN} y ${GRADE_MAX}.`,
        });
      }
      avgRef[s.id] = { sheet: ws.name, col: avgCol };
    }

    // Lámina de concentración con fórmulas que referencian cada hoja
    const wc = wb.addWorksheet(sheetName('Concentración de notas'), { views: [{ state: 'frozen', xSplit: 2, ySplit: FIRST - 1 }] });
    const ns = c.subjects.length;
    wc.columns = [{ width: 5 }, { width: 38 }, ...c.subjects.map(() => ({ width: 7 })), { width: 11 }, { width: 8 }];
    header(wc, 'Concentración de notas', ns + 4);
    headRow(wc, ['N°', 'Nombre del estudiante', ...c.subjects.map((s) => s.name + (s.inAverage ? '' : ' (*)')), 'Promedio final', 'Asist. %'],
      { [ns + 2]: NAVY });
    wc.getRow(FIRST - 1).height = 150;
    for (let k = 3; k <= ns + 2; k++) wc.getRow(FIRST - 1).getCell(k).alignment = { textRotation: 90, horizontal: 'center', vertical: 'bottom', wrapText: true };
    const finalCol = colL(ns + 2);
    c.students.forEach((st, i) => {
      const r = FIRST + i;
      const row = wc.getRow(r);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = st.name;
      const incl = [];
      c.subjects.forEach((s, j) => {
        const ref = avgRef[s.id];
        row.getCell(j + 3).value = { formula: `'${ref.sheet.replace(/'/g, "''")}'!${ref.col}${r}`, result: subjectAvg(c, s.id, st.id) ?? '' };
        row.getCell(j + 3).numFmt = numFmt;
        if (s.inAverage) incl.push(`${colL(j + 2)}${r}`);
      });
      const list = incl.join(',') || '""';
      row.getCell(ns + 3).value = {
        formula: incl.length ? `IF(COUNT(${list})=0,"",ROUND(AVERAGE(${list}),${d}))` : '""',
        result: finalAvg(c, st.id) ?? '',
      };
      row.getCell(ns + 3).numFmt = numFmt;
      row.getCell(ns + 3).font = { bold: true };
      row.getCell(ns + 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF8' } };
      row.getCell(ns + 4).value = st.attendance ?? null;
      for (let k = 1; k <= ns + 4; k++) {
        const cell = row.getCell(k);
        cell.border = border;
        cell.alignment = { horizontal: k === 2 ? 'left' : 'center', vertical: 'middle' };
      }
    });
    if (c.students.length) {
      redBelowPass(wc, `C${FIRST}:${finalCol}${last}`);
      const fr = wc.getRow(last + 1);
      fr.getCell(2).value = 'Promedio del curso';
      for (let k = 3; k <= ns + 4; k++) {
        const L = colL(k - 1);
        fr.getCell(k).value = { formula: `IF(COUNT(${L}${FIRST}:${L}${last})=0,"",ROUND(AVERAGE(${L}${FIRST}:${L}${last}),1))` };
        fr.getCell(k).numFmt = '0.0';
      }
      for (let k = 1; k <= ns + 4; k++) {
        const cell = fr.getCell(k);
        cell.font = { bold: true, color: { argb: NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } };
        cell.border = border;
        cell.alignment = { horizontal: k === 2 ? 'left' : 'center' };
      }
    }
    if (c.subjects.some((s) => !s.inAverage)) {
      wc.getCell(`B${last + 3}`).value = '(*) Asignatura no considerada en el promedio final.';
      wc.getCell(`B${last + 3}`).font = { italic: true, size: 9, color: { argb: 'FF667085' } };
    }
    wc.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1 };

    // Nómina
    const wsS = wb.addWorksheet(sheetName('Estudiantes'), { views: [{ state: 'frozen', ySplit: FIRST - 1 }] });
    wsS.columns = [{ width: 5 }, { width: 38 }, { width: 14 }, { width: 12 }, { width: 60 }];
    header(wsS, 'Nómina de estudiantes', 5);
    headRow(wsS, ['N°', 'Nombre del estudiante', 'RUT', 'Asistencia %', 'Observaciones']);
    c.students.forEach((st, i) => {
      const row = wsS.getRow(FIRST + i);
      [i + 1, st.name, st.rut, st.attendance ?? null, st.obs].forEach((v, k) => {
        const cell = row.getCell(k + 1);
        cell.value = v;
        cell.border = border;
        cell.alignment = { horizontal: k === 1 || k === 4 ? 'left' : 'center', wrapText: k === 4 };
      });
    });

    wb.views = [{ activeTab: c.subjects.length }];
    const buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Notas ${c.name} - ${periodLabel()}.xlsx`.replace(/[\\/:*?"<>|°]/g, ''));
    toast('Planilla Excel descargada');
  }

  /* ====================== Utilidades ====================== */

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  let dlgHandler = null;
  function openDialog(title, body, onOk, okLabel = 'Guardar') {
    $('#dlgTitle').textContent = title;
    $('#dlgBody').innerHTML = body;
    $('#dlgOk').textContent = okLabel;
    dlgHandler = onOk;
    $('#dlg').showModal();
    $('#dlgBody').querySelector('input, textarea, select')?.focus();
  }
  $('#dlgForm').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    if (dlgHandler && dlgHandler(e.target) === false) e.preventDefault();
  });

  /* ====================== Diálogos de curso y configuración ====================== */

  function courseDialog(existing) {
    const c = existing || newCourse('', '');
    const subjRow = (s) => `
      <div class="subj-row" data-id="${s.id}">
        <input type="text" value="${esc(s.name)}" aria-label="Nombre de la asignatura" required>
        <label><input type="checkbox" ${s.inAverage ? 'checked' : ''}> En promedio</label>
        <button type="button" class="icon-btn" data-up title="Subir">↑</button>
        <button type="button" class="icon-btn" data-down title="Bajar">↓</button>
        <button type="button" class="icon-btn del" data-rm title="Quitar">✕</button>
      </div>`;
    openDialog(existing ? 'Editar curso' : 'Nuevo curso', `
      <div class="form-grid">
        <label>Nombre del curso<input name="name" value="${esc(c.name)}" placeholder="Ej: 5° Año Básico" required></label>
        <label>Profesor(a) jefe<input name="teacher" value="${esc(c.teacher)}"></label>
        <div class="full">
          <div class="muted" style="margin-bottom:6px">Asignaturas (cada una es una pestaña). Desmarca «En promedio» si no debe contar en el promedio final.</div>
          <div class="subj-list" id="subjList">${c.subjects.map(subjRow).join('')}</div>
          <button type="button" class="btn ghost small" id="addSubj" style="margin-top:8px">+ Agregar asignatura</button>
        </div>
      </div>`, () => {
      const f = $('#dlgForm');
      c.name = f.elements.namedItem('name').value.trim();
      c.teacher = f.elements.namedItem('teacher').value.trim();
      const rows = [...document.querySelectorAll('#subjList .subj-row')];
      const keep = new Set(rows.map((r) => r.dataset.id));
      const removed = c.subjects.filter((s) => !keep.has(s.id));
      const withGrades = removed.filter((s) => Object.values(c.grades[s.id] || {}).some((g) => g.some((v) => v != null)));
      if (withGrades.length && !confirm(`Se eliminarán las notas de: ${withGrades.map((s) => s.name).join(', ')}. ¿Continuar?`)) return false;
      const old = Object.fromEntries(c.subjects.map((s) => [s.id, s]));
      c.subjects = rows.map((r) => ({
        ...(old[r.dataset.id] || {}),
        id: r.dataset.id,
        name: r.querySelector('input[type=text]').value.trim() || 'Asignatura',
        inAverage: r.querySelector('input[type=checkbox]').checked,
      }));
      for (const s of removed) { delete c.grades[s.id]; delete c.cols[s.id]; }
      if (!existing) { state.courses.push(c); state.currentCourse = c.id; state.currentTab = 'alumnos'; }
      save(); render();
      toast(existing ? 'Curso actualizado' : 'Curso creado');
    }, existing ? 'Guardar' : 'Crear curso');

    const list = $('#subjList');
    $('#addSubj').onclick = () => {
      list.insertAdjacentHTML('beforeend', subjRow({ id: uid(), name: '', inAverage: true }));
      list.lastElementChild.querySelector('input').focus();
    };
    list.onclick = (e) => {
      const row = e.target.closest('.subj-row');
      if (!row) return;
      if (e.target.matches('[data-rm]')) row.remove();
      if (e.target.matches('[data-up]') && row.previousElementSibling) row.after(row.previousElementSibling);
      if (e.target.matches('[data-down]') && row.nextElementSibling) row.before(row.nextElementSibling);
    };
  }

  function settingsDialog() {
    const cf = state.config;
    openDialog('Configuración general', `
      <div class="form-grid">
        <label>Año<input name="year" type="number" min="2000" max="2100" value="${esc(cf.year)}" required></label>
        <label>Semestre<select name="semester">
          ${['Primer', 'Segundo'].map((s) => `<option ${s === cf.semester ? 'selected' : ''}>${s}</option>`).join('')}
        </select></label>
        <label>Director(a)<input name="director" value="${esc(cf.director)}"></label>
        <label>Decimales en promedios<select name="decimals">
          <option value="0" ${cf.decimals === 0 ? 'selected' : ''}>Sin decimales (ej. 46)</option>
          <option value="1" ${cf.decimals === 1 ? 'selected' : ''}>Un decimal (ej. 45,8)</option>
        </select></label>
        <p class="full muted" style="margin:0">Escala de notas de ${GRADE_MIN} a ${GRADE_MAX}; nota de aprobación ${PASS_MARK}.
          Los promedios bajo ${PASS_MARK} se muestran en rojo.</p>
      </div>`, (f) => {
      cf.year = parseInt(f.year.value, 10) || cf.year;
      cf.semester = f.semester.value;
      cf.director = f.director.value.trim();
      cf.decimals = parseInt(f.decimals.value, 10);
      save(); render();
      toast('Configuración guardada');
    });
  }

  /* ====================== Eventos ====================== */

  $('#courseSelect').addEventListener('change', (e) => {
    state.currentCourse = e.target.value;
    save(); render();
  });
  $('#btnCourse').addEventListener('click', () => course() && courseDialog(course()));
  $('#btnNewCourse').addEventListener('click', () => courseDialog(null));
  $('#btnExcel').addEventListener('click', () => course() && exportExcel().catch((err) => { console.error(err); toast('Error al generar el Excel'); }));

  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    state.currentTab = t.dataset.tab;
    save(); renderTabs(); renderSheet();
  });

  const menu = $('#menuList');
  $('#btnMenu').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => { menu.hidden = true; });
  menu.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    menu.hidden = true;
    const c = course();
    if (act === 'settings') settingsDialog();
    if (act === 'backup') {
      const stamp = new Date().toISOString().slice(0, 10);
      download(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), `respaldo-notas-lo-narvaez-${stamp}.json`);
    }
    if (act === 'restore') $('#fileRestore').click();
    if (act === 'printAll' && c) printReports(c, c.students);
    if (act === 'deleteCourse' && c) {
      if (!confirm(`¿Eliminar el curso «${c.name}» con todas sus notas? Esta acción no se puede deshacer.`)) return;
      state.courses = state.courses.filter((x) => x !== c);
      state.currentCourse = state.courses[0]?.id;
      save(); render();
    }
  });

  $('#fileRestore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.courses) || !data.config) throw new Error('formato');
      if (!confirm('Se reemplazarán todos los datos actuales por los del respaldo. ¿Continuar?')) return;
      state = data;
      save(); render();
      toast('Respaldo restaurado');
    } catch (err) {
      toast('El archivo no es un respaldo válido');
    }
  });

  // Botones de la barra de la planilla
  $('#sheetActions').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const c = course();
    if (act === 'addCol') {
      const s = c.subjects.find((x) => x.id === state.currentTab);
      c.cols[s.id] = colCount(c, s.id) + 1;
      save(); renderSheet();
      const wrap = $('#sheetWrap');
      wrap.scrollLeft = wrap.scrollWidth;
    }
    if (act === 'addStudents') addStudentsDialog();
    if (act === 'sortStudents') {
      c.students.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      save(); renderSheet();
    }
    if (act === 'printConc') printConcentration(c);
    if (act === 'printAll') printReports(c, c.students);
  });

  $('#sheetBar').addEventListener('change', (e) => {
    const s = course().subjects.find((x) => x.id === e.target.dataset.optional);
    if (!s) return;
    s.inAverage = e.target.checked;
    save(); renderSheet();
    toast(`${s.name}: ${s.inAverage ? 'se incluye' : 'no se incluye'} en el promedio final`);
  });

  const wrap = $('#sheetWrap');

  wrap.addEventListener('click', (e) => {
    const c = course();
    const t = e.target;
    if (t.matches('[data-delcol]')) {
      deleteColumn(c, c.subjects.find((x) => x.id === state.currentTab), +t.dataset.delcol);
    } else if (t.matches('[data-report]')) {
      printReports(c, [c.students[+t.dataset.report]]);
    } else if (t.matches('[data-move]')) {
      const [r, dir] = t.dataset.move.split(':').map(Number);
      const j = r + dir;
      if (j < 0 || j >= c.students.length) return;
      [c.students[r], c.students[j]] = [c.students[j], c.students[r]];
      save(); renderSheet();
    } else if (t.matches('[data-delstudent]')) {
      const st = c.students[+t.dataset.delstudent];
      if (!confirm(`¿Eliminar a «${st.name}» y todas sus notas?`)) return;
      c.students.splice(+t.dataset.delstudent, 1);
      for (const sid of Object.keys(c.grades)) delete c.grades[sid][st.id];
      save(); renderSheet();
    }
  });

  wrap.addEventListener('input', (e) => {
    const inp = e.target;
    const c = course();
    const r = +inp.dataset.r;
    if (inp.dataset.field) {
      const st = c.students[r];
      if (inp.dataset.field === 'attendance') {
        const t = inp.value.trim().replace(',', '.');
        const v = t === '' ? null : Number(t);
        const ok = v === null || (!Number.isNaN(v) && v >= 0 && v <= 100);
        inp.classList.toggle('invalid', !ok);
        if (ok) st.attendance = v;
      } else {
        st[inp.dataset.field] = inp.value;
      }
      save();
      return;
    }
    if (inp.dataset.c === undefined) return;
    const subj = c.subjects.find((x) => x.id === state.currentTab);
    const v = parseGrade(inp.value);
    const bad = Number.isNaN(v);
    inp.classList.toggle('invalid', bad);
    if (bad) return;
    setGrade(c, subj, r, +inp.dataset.c, v);
    refreshRowAvg(c, subj, r);
    updateSubjectFooter(c, subj);
    save();
  });

  wrap.addEventListener('focusout', (e) => {
    const inp = e.target;
    if (inp.dataset.c === undefined) return;
    const c = course();
    const subj = c.subjects.find((x) => x.id === state.currentTab);
    if (!subj) return;
    const stored = c.grades[subj.id]?.[c.students[+inp.dataset.r]?.id]?.[+inp.dataset.c];
    if (inp.classList.contains('invalid')) toast(`Nota inválida: «${inp.value}». Usa valores entre ${GRADE_MIN} y ${GRADE_MAX}.`);
    inp.classList.remove('invalid');
    inp.value = fmtGrade(stored ?? null);
  });

  function focusCell(r, k) {
    const el = $(`#sheetWrap input[data-r="${r}"][data-c="${k}"]`) ||
      $(`#sheetWrap input[data-r="${r}"][data-field="${k}"]`);
    if (el) { el.focus(); el.select(); }
    return !!el;
  }

  wrap.addEventListener('keydown', (e) => {
    const inp = e.target;
    if (inp.tagName !== 'INPUT') return;
    const r = +inp.dataset.r;
    const k = inp.dataset.c !== undefined ? +inp.dataset.c : inp.dataset.field;
    const atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
    const atEnd = inp.selectionStart === inp.value.length;
    const allSel = inp.selectionStart === 0 && inp.selectionEnd === inp.value.length;
    let moved = false;
    if (e.key === 'Enter' || e.key === 'ArrowDown') moved = focusCell(r + (e.shiftKey && e.key === 'Enter' ? -1 : 1), k);
    else if (e.key === 'ArrowUp') moved = focusCell(r - 1, k);
    else if (typeof k === 'number' && e.key === 'ArrowRight' && (atEnd || allSel)) moved = focusCell(r, k + 1);
    else if (typeof k === 'number' && e.key === 'ArrowLeft' && (atStart || allSel)) moved = focusCell(r, k - 1);
    if (moved || e.key === 'Enter') e.preventDefault();
  });

  // Pegar un bloque de notas copiado desde Excel / Google Sheets
  wrap.addEventListener('paste', (e) => {
    const inp = e.target;
    if (inp.dataset.c === undefined) return;
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const c = course();
    const subj = c.subjects.find((x) => x.id === state.currentTab);
    const r0 = +inp.dataset.r, c0 = +inp.dataset.c;
    const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
    let invalid = 0, count = 0, maxCol = 0;
    rows.forEach((line, i) => {
      const r = r0 + i;
      if (r >= c.students.length) return;
      line.split('\t').forEach((cellText, j) => {
        const v = parseGrade(cellText);
        if (Number.isNaN(v)) { invalid++; return; }
        setGrade(c, subj, r, c0 + j, v);
        maxCol = Math.max(maxCol, c0 + j + 1);
        count++;
      });
    });
    c.cols[subj.id] = Math.max(c.cols[subj.id] || 0, maxCol);
    save(); renderSheet();
    toast(`${count} nota(s) pegadas${invalid ? ` · ${invalid} valor(es) inválido(s) omitidos` : ''}`);
  });

  window.addEventListener('beforeunload', () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* nada que hacer */ }
  });

  render();
})();
