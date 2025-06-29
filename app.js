// --- app.js ---
// This file contains all the client-side JavaScript logic for the degree planner.

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let allCourses = [];
    let allPrograms = [];
    let selectedProgram = null;
    let selectedMajor = null;
    let plan = []; // e.g., [{ id: 'uuid', year: 2025, trimester: 1, courses: ['1004ICT'] }]
    let draggedCourseCode = null; // To hold the course code being dragged

    // --- DOM Elements (will be assigned in initializeApp) ---
    let programSelect, majorSelect, plannerContainer, plannerScrollArea, creditPointCounter,
        coursePoolTabs, clearPlanBtn, addTrimesterBtn, coursePoolContent,
        electiveFilters, modal, coursePoolContainer;

    // --- Data Management ---
    const saveData = () => {
        const dataToSave = { programCode: selectedProgram?.code, majorName: selectedMajor?.name, plan: plan };
        localStorage.setItem('degreePlannerData', JSON.stringify(dataToSave));
    };

    const loadData = async () => {
        try {
            const [coursesRes, programsRes] = await Promise.all([fetch('./courses.json'), fetch('./programs.json')]);
            if (!coursesRes.ok || !programsRes.ok) throw new Error('Failed to fetch data files.');
            allCourses = await coursesRes.json();
            allPrograms = await programsRes.json();
            return JSON.parse(localStorage.getItem('degreePlannerData'));
        } catch (error) {
            console.error("Fatal Error:", error);
            if (plannerContainer) plannerContainer.innerHTML = `<p class="text-center text-red-400">Could not load data.</p>`;
            return null;
        }
    };

    // --- Validation Logic ---
    const validateCourse = (course, plannedTriIndex) => {
        if (!course) return { isValid: false, messages: ["Course data not found."] };
        const allPlannedCourses = plan.flatMap(p => p.courses);
        const coursesCompletedBefore = plan.slice(0, plannedTriIndex).flatMap(p => p.courses);

        const isOffered = course.trimesters_offered && Object.keys(course.trimesters_offered).includes(plan[plannedTriIndex].trimester.toString());

        let antiReqConflict = false;
        if (course.anti_requisites?.length > 0) {
            const antiReqCodes = course.anti_requisites.flatMap(ar => ar.codes || []);
            // Check for conflict only with OTHER courses in the plan
            antiReqConflict = allPlannedCourses.some(c => antiReqCodes.includes(c) && c !== course.code);
        }

        let preReqsMet = true;
        if (course.prerequisites?.length > 0) {
            preReqsMet = course.prerequisites.every(prereq => {
                if (prereq.type === 'courses' && prereq.codes) {
                    return prereq.logic === 'OR'
                        ? prereq.codes.some(code => coursesCompletedBefore.includes(code))
                        : prereq.codes.every(code => coursesCompletedBefore.includes(code));
                }
                return true;
            });
        }

        const isValid = isOffered && !antiReqConflict && preReqsMet;
        let messages = [];
        if (!isOffered) messages.push("Not offered in this trimester.");
        if (antiReqConflict) messages.push("Incompatible course (anti-requisite) is also in the plan.");
        if (!preReqsMet) messages.push("Prerequisites not met in a previous trimester.");
        return { isValid, messages };
    };

    // --- Core Rendering Functions ---
    const rerender = () => {
        renderPlannerGrid();
        renderCoursePool();
        saveData();
    };

    const renderProgramSelect = (savedProgramCode) => {
        programSelect.innerHTML = allPrograms.map(p => `<option value="${p.code}" ${p.code === savedProgramCode ? 'selected' : ''}>${p.name}</option>`).join('');
    };

    const renderMajorSelect = (savedMajorName) => {
        if (!selectedProgram || !selectedProgram.major || selectedProgram.major.length === 0) {
            majorSelect.innerHTML = '<option value="">N/A</option>';
            majorSelect.disabled = true;
            return;
        }
        majorSelect.disabled = false;
        let optionsHTML = selectedProgram.major.map(m => `<option value="${m.name}" ${m.name === savedMajorName ? 'selected' : ''}>${m.name}</option>`).join('');
        majorSelect.innerHTML = `<option value="">None</option>` + optionsHTML;
        if (savedMajorName) majorSelect.value = savedMajorName;
    };

    const renderPlannerGrid = () => {
        plannerScrollArea.innerHTML = ''; // Clear only the scrollable area
        plan.forEach((trimesterData, index) => {
            if (trimesterData && typeof trimesterData === 'object') {
                const sectionEl = renderTrimesterSection(trimesterData, index);
                plannerScrollArea.appendChild(sectionEl); // Append to the scroll area
            }
        });
        updateCreditPoints();
    };

    const renderTrimesterSection = (trimesterData, triIndex) => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'p-4 bg-gray-800/50 rounded-lg';
        sectionEl.dataset.id = trimesterData.id;

        const currentYear = new Date().getFullYear();
        const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear - 1 + i).map(y => `<option value="${y}" ${y === trimesterData.year ? 'selected' : ''}>${y}</option>`).join('');
        const coursesHTML = (trimesterData.courses || []).map(code => renderCourseRow(getCourseByCode(code), triIndex)).join('');

        sectionEl.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <div class="flex items-center gap-4 text-xs">
                    <select data-type="year" class="year-select bg-gray-700 border-gray-600 rounded-md p-2 text-white focus:ring-indigo-500 focus:border-indigo-500">${yearOptions}</select>
                    <select data-type="trimester" class="trimester-select bg-gray-700 border-gray-600 rounded-md p-2 text-white focus:ring-indigo-500 focus:border-indigo-500">
                        <option value="1" ${trimesterData.trimester === 1 ? 'selected' : ''}>Trimester 1</option>
                        <option value="2" ${trimesterData.trimester === 2 ? 'selected' : ''}>Trimester 2</option>
                        <option value="3" ${trimesterData.trimester === 3 ? 'selected' : ''}>Trimester 3</option>
                    </select>
                </div>
                <button class="remove-trimester-btn text-gray-400 hover:text-red-400" title="Remove Trimester"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="trimester-table-container rounded-lg">
                <table class="planner-table">
                    <thead class="text-xs text-gray-400 uppercase bg-gray-900/30">
                        <tr>
                            <th class="p-2 w-8"></th>
                            <th class="p-2 text-left w-24">Code</th>
                            <th class="p-2 text-left w-auto">Name</th>
                            <th class="p-2 text-left w-1/3">Requisites</th>
                            <th class="p-2 text-right w-20"></th>
                        </tr>
                    </thead>
                    <tbody class="trimester-slot divide-y divide-gray-700 text-xs">
                        ${coursesHTML || '<tr><td colspan="5" class="text-gray-500 text-center p-6">Drag courses here</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        return sectionEl;
    };

    const renderCourseRow = (course, plannedTriIndex) => {
        if (!course) return '';
        const validation = validateCourse(course, plannedTriIndex);
        const errorClass = !validation.isValid ? 'error-border' : '';
        const errorTooltip = validation.messages.join(' \n');

        return `
            <tr class="planned-course-row bg-indigo-900/40 hover:bg-indigo-900/60" title="${errorTooltip}" data-course-code="${course.code}">
                <td class="p-2 text-center drag-handle" draggable="true"><i class="fas fa-grip-vertical"></i></td>
                <td class="p-2">${course.code}</td>
                <td class="p-2">${course.name}
                    <div>
                       ${formatBadges(course.campuses, 'bg-gray-600/50')}
                       ${formatBadges(Object.values(course.trimesters_offered || {}), 'bg-teal-800/50')}
                   </div>
                </td>
                <td class="p-2">${formatRequisitePills(course, plannedTriIndex)}</td>
                <td class="p-2 text-right">
                    <button class="details-btn text-gray-400 hover:text-white px-2"><i class="fas fa-info-circle"></i></button>
                    <button class="remove-course-btn text-gray-400 hover:text-red-400 px-2"><i class="fas fa-times-circle"></i></button>
                </td>
            </tr>
        `;
    };

    const formatBadges = (items, colorClass) => {
        if (!items || items.length === 0) return '<span class="text-gray-500">N/A</span>';
        return items.map(item => `<span class="badge ${colorClass}">${item.replace('Trimester ', 'T')}</span>`).join(' ');
    };

    const formatRequisitePills = (course, plannedTriIndex) => {
        if (!course) return '';
        const coursesCompletedBefore = plan.slice(0, plannedTriIndex).flatMap(p => p.courses);

        const prereqHTML = (course.prerequisites || []).map(req => {
            if (req.type === 'courses' && req.codes) {
                const met = req.logic === 'OR' ? req.codes.some(c => coursesCompletedBefore.includes(c)) : req.codes.every(c => coursesCompletedBefore.includes(c));
                return `<span class="badge ${met ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}">PRE: ${req.codes.join(` ${req.logic} `)}</span>`;
            }
            if (req.type === 'units') return `<span class="badge bg-amber-800 text-amber-200">PRE: ${req.amount} CP</span>`;
            return '';
        }).join('');

        const allPlannedCourses = plan.flatMap(p => p.courses);
        const antiReqHTML = (course.anti_requisites || []).map(req => {
            if (req.type === 'courses' && req.codes) {
                //const conflict = allPlannedCourses.some(c => allPlannedCourses.includes(c));
                //return `<span class="badge ${conflict ? 'bg-red-800 text-red-200' : 'bg-gray-600'}">ANTI: ${req.codes.join(', ')}</span>`;
                return `<span class="badge bg-gray-600">INCOMPAT: ${req.codes.join(', ')}</span>`;
            }
            return '';
        }).join('');

        return prereqHTML + antiReqHTML || '<span class="text-gray-500">None</span>';
    };

    const renderCoursePill = (course) => {
        if (!course) return '';
        return `
            <div class="course-pill p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-600/80" data-course-code="${course.code}" draggable="true">
                <p class="font-bold text-sm">${course.code} <span class="font-normal text-gray-300">${course.name}</span></p>
                <div class="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-600 flex justify-between items-center">
                   <div>
                       ${formatBadges(course.campuses, 'bg-gray-600/50')}
                       ${formatBadges(Object.values(course.trimesters_offered || {}), 'bg-teal-800/50')}
                   </div>
                   <button class="details-btn text-gray-400 hover:text-indigo-400"><i class="fas fa-info-circle"></i></button>
                </div>
            </div>
        `;
    };

    const renderCoursePool = () => {
        Object.values(coursePoolContent).forEach(list => list.innerHTML = '');
        const plannedCourses = new Set(plan.flatMap(tri => tri.courses));
        if (!selectedProgram) return;

        coursePoolContent.core.innerHTML = (selectedProgram.core || []).map(getCourseByCode).filter(c => c && !plannedCourses.has(c.code)).map(renderCoursePill).join('') || '<p class="text-xs text-gray-500">All core courses planned.</p>';
        coursePoolContent.coreOptions.innerHTML = (selectedProgram.core_options || []).map(getCourseByCode).filter(c => c && !plannedCourses.has(c.code)).map(renderCoursePill).join('') || '<p class="text-xs text-gray-500">All core options planned.</p>';

        let majorCoursesHTML = '<p class="text-xs text-gray-500">Select a major.</p>';
        if (selectedMajor) {
            majorCoursesHTML = (selectedMajor.courses || []).map(getCourseByCode).filter(c => c && !plannedCourses.has(c.code)).map(renderCoursePill).join('') || '<p class="text-xs text-gray-500">All major courses planned.</p>';
        } else if (!selectedProgram.major || selectedProgram.major.length === 0) {
            majorCoursesHTML = '<p class="text-xs text-gray-500">No majors in this program.</p>';
        }
        coursePoolContent.major.innerHTML = majorCoursesHTML;

        const searchTerm = electiveFilters.search.value.toLowerCase();
        const campus = electiveFilters.campus.value;
        const trimester = electiveFilters.trimester.value;

        let electives = allCourses.filter(c => !plannedCourses.has(c.code));
        if (searchTerm) electives = electives.filter(c => c.name.toLowerCase().includes(searchTerm) || c.code.toLowerCase().includes(searchTerm));
        if (campus) electives = electives.filter(c => c.campuses?.includes(campus));
        if (trimester) electives = electives.filter(c => c.trimesters_offered && Object.values(c.trimesters_offered).includes(trimester));
        coursePoolContent.electives.innerHTML = electives.slice(0, 50).map(renderCoursePill).join('') || '<p class="text-xs text-gray-500">No electives match filters.</p>';
    };

    const populateFilters = () => {
        const campuses = new Set();
        const trimesters = new Set();
        allCourses.forEach(c => {
            if (c.campuses) c.campuses.forEach(cam => campuses.add(cam));
            if (c.trimesters_offered && typeof c.trimesters_offered === 'object') {
                Object.keys(c.trimesters_offered).forEach(triKey => {
                    const triNum = parseInt(triKey, 10);
                    if (!isNaN(triNum) && triNum > 0) trimesters.add(triKey);
                });
            }
        });
    };

    // --- Helper & Modal Functions ---
    const getCourseByCode = (code) => allCourses.find(c => c.code === code);
    const updateCreditPoints = () => {
        const plannedCount = plan.flatMap(tri => tri.courses).length;
        creditPointCounter.textContent = `Total Credit Points: ${plannedCount * 10} / 240`;
    };
    const openCourseModal = (course) => {
        if (!course) return;
        modal.title.textContent = course.name;
        modal.code.textContent = course.code;
        modal.description.textContent = course.description || 'No description available.';
        modal.campuses.innerHTML = formatBadges(course.campuses, 'bg-gray-600');
        modal.trimesters.innerHTML = formatBadges(Object.values(course.trimesters_offered || {}), 'bg-teal-800');
        const formatFullReqs = (reqs) => (reqs || []).map(r => `<p>${r.summary}</p>`).join('') || 'None';
        modal.prerequisites.innerHTML = formatFullReqs(course.prerequisites);
        modal.antirequisites.innerHTML = formatFullReqs(course.anti_requisites);
        modal.container.classList.remove('hidden');
    };
    const closeCourseModal = () => modal.container.classList.add('hidden');

    // --- Event Handlers ---
    const handleProgramChange = () => {
        selectedProgram = allPrograms.find(p => p.code === parseInt(programSelect.value, 10));
        plan = [];
        renderMajorSelect(null);
        handleMajorChange();
    };
    const handleMajorChange = () => {
        selectedMajor = selectedProgram.major?.find(m => m.name === majorSelect.value);
        //plan = [];
        rerender();
    };
    const handleTabClick = (e) => {
        if (!e.target.classList.contains('tab-btn')) return;
        coursePoolTabs.querySelectorAll('.tab-btn').forEach(btn => btn.className = btn.className.replace('border-indigo-500 text-indigo-400', 'border-transparent text-gray-400'));
        e.target.className = e.target.className.replace('border-transparent text-gray-400', 'border-indigo-500 text-indigo-400');
        Object.values(coursePoolContent).forEach(list => list.classList.add('hidden'));
        coursePoolContent[e.target.dataset.tab].classList.remove('hidden');
        electiveFilters.container.classList.toggle('hidden', e.target.dataset.tab !== 'electives');
    };
    const handleAddTrimester = () => {
        const lastTrimester = plan[plan.length - 1];
        let newYear = lastTrimester ? lastTrimester.year : new Date().getFullYear();
        let newTri = lastTrimester ? lastTrimester.trimester + 1 : 1;
        if (newTri > 3) { newTri = 1; newYear++; }
        plan.push({ id: crypto.randomUUID(), year: newYear, trimester: newTri, courses: [] });
        rerender();
    };
    const handlePlannerInteraction = (e) => {
        const removeTriBtn = e.target.closest('.remove-trimester-btn');
        const removeCourseBtn = e.target.closest('.remove-course-btn');
        const detailsBtn = e.target.closest('.details-btn');
        const select = e.target.closest('select');

        if (removeTriBtn) {
            const sectionId = removeTriBtn.closest('[data-id]').dataset.id;
            plan = plan.filter(p => p.id !== sectionId);
        } else if (removeCourseBtn) {
            const sectionId = removeCourseBtn.closest('[data-id]').dataset.id;
            const courseCode = removeCourseBtn.closest('[data-course-code]').dataset.courseCode;
            const tri = plan.find(p => p.id === sectionId);
            if (tri) tri.courses = tri.courses.filter(c => c !== courseCode);
        } else if (detailsBtn) {
            const courseCode = detailsBtn.closest('[data-course-code]').dataset.courseCode;
            openCourseModal(getCourseByCode(courseCode));
            return;
        } else if (select) {
            const sectionId = select.closest('[data-id]').dataset.id;
            const tri = plan.find(p => p.id === sectionId);
            if (tri) tri[select.dataset.type] = parseInt(select.value, 10);
        } else {
            return;
        }
        rerender();
    };
    const handleClearPlan = () => {
        if (confirm("Are you sure you want to clear your entire degree plan? This action cannot be undone.")) {
            plan = [];
            rerender();
        }
    };
    const handleCoursePoolClick = (e) => {
        const detailsBtn = e.target.closest('.details-btn');
        if (detailsBtn) {
            const pill = detailsBtn.closest('.course-pill');
            if (pill) openCourseModal(getCourseByCode(pill.dataset.courseCode));
        }
    };

    // --- Drag and Drop Logic ---
    function handleDragStart(e) {
        const draggableElement = e.target.closest('[data-course-code]');
        if (!draggableElement) { e.preventDefault(); return; }

        draggedCourseCode = draggableElement.dataset.courseCode;
        e.dataTransfer.setData('text/plain', draggedCourseCode);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => draggableElement.classList.add('opacity-50'), 0);
    }

    function handleDragEnd(e) {
        if (draggedCourseCode) {
            const draggableElement = document.querySelector(`[data-course-code="${draggedCourseCode}"]`);
            if (draggableElement) draggableElement.classList.remove('opacity-50');
        }
        draggedCourseCode = null;
    }

    function handleDragOver(e) {
        e.preventDefault();
        const dropZone = e.target.closest('.trimester-slot');
        if (dropZone) {
            e.dataTransfer.dropEffect = 'move';
            dropZone.closest('.trimester-table-container').classList.add('drag-over');
        }
    }

    function handleDragLeave(e) {
        const dropZone = e.target.closest('.trimester-table-container');
        if (dropZone) dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        const dropZone = e.target.closest('.trimester-slot');
        if (!dropZone) return;

        dropZone.closest('.trimester-table-container').classList.remove('drag-over');
        const courseCode = e.dataTransfer.getData('text/plain');
        if (!courseCode) return;

        const sectionId = dropZone.closest('[data-id]').dataset.id;

        plan.forEach(p => p.courses = p.courses.filter(c => c !== courseCode));

        const targetTri = plan.find(p => p.id === sectionId);
        if (targetTri) {
            if (!targetTri.courses.includes(courseCode)) {
                targetTri.courses.push(courseCode);
            }
            targetTri.courses.sort();
        }

        rerender();
    }

    // --- Initialization ---
    async function initializeApp() {
        programSelect = document.getElementById('program-select');
        majorSelect = document.getElementById('major-select');
        plannerContainer = document.getElementById('planner-container');
        plannerScrollArea = document.getElementById('planner-container');
        creditPointCounter = document.getElementById('credit-point-counter');
        coursePoolTabs = document.getElementById('course-pool-tabs');
        clearPlanBtn = document.getElementById('clear-plan-btn');
        addTrimesterBtn = document.getElementById('add-trimester-btn');
        coursePoolContainer = document.getElementById('course-pool-content');

        if (!coursePoolContainer) {
            console.error("Initialization failed: #course-pool-content not found.");
            return;
        }

        coursePoolContent = {
            core: document.getElementById('core-courses-list'),
            coreOptions: document.getElementById('core-options-courses-list'),
            major: document.getElementById('major-courses-list'),
            electives: document.getElementById('electives-courses-list'),
        };
        electiveFilters = {
            container: document.getElementById('elective-filters'),
            search: document.getElementById('elective-search'),
            campus: document.getElementById('campus-filter'),
            trimester: document.getElementById('trimester-filter'),
        };
        modal = {
            container: document.getElementById('course-modal'),
            title: document.getElementById('modal-title'),
            code: document.getElementById('modal-code'),
            description: document.getElementById('modal-description'),
            campuses: document.getElementById('modal-campuses'),
            trimesters: document.getElementById('modal-trimesters'),
            prerequisites: document.getElementById('modal-prerequisites'),
            antirequisites: document.getElementById('modal-antirequisites'),
            closeBtn: document.getElementById('close-modal-btn'),
        };

        // --- Event Delegation Setup ---
        plannerContainer.addEventListener('click', handlePlannerInteraction);
        coursePoolContainer.addEventListener('click', handleCoursePoolClick);

        document.body.addEventListener('dragstart', handleDragStart);
        document.body.addEventListener('dragend', handleDragEnd);

        plannerContainer.addEventListener('dragover', handleDragOver);
        plannerContainer.addEventListener('dragleave', handleDragLeave);
        plannerContainer.addEventListener('drop', handleDrop);

        // Other event listeners
        programSelect.addEventListener('change', handleProgramChange);
        majorSelect.addEventListener('change', handleMajorChange);
        coursePoolTabs.addEventListener('click', handleTabClick);
        clearPlanBtn.addEventListener('click', handleClearPlan);
        addTrimesterBtn.addEventListener('click', handleAddTrimester);
        modal.closeBtn.addEventListener('click', closeCourseModal);
        modal.container.addEventListener('click', e => { if (e.target === modal.container) closeCourseModal(); });
        electiveFilters.search.addEventListener('input', renderCoursePool);
        electiveFilters.campus.addEventListener('change', renderCoursePool);
        electiveFilters.trimester.addEventListener('change', renderCoursePool);

        // --- Initial Load ---
        const savedData = await loadData();
        if (allPrograms.length > 0 && allCourses.length > 0) {
            renderProgramSelect(savedData?.programCode);
            populateFilters();
            selectedProgram = allPrograms.find(p => p.code === (savedData?.programCode || parseInt(programSelect.value, 10)));
            renderMajorSelect(savedData?.majorName);
            selectedMajor = selectedProgram.major?.find(m => m.name === (savedData?.majorName || ""));
            plan = savedData?.plan && Array.isArray(savedData.plan) ? savedData.plan : [];
            rerender();
        }
    }

    initializeApp();
});
