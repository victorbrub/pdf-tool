App.splitter = (() => {
    const state = App.state;
    const { showError, clearResults, setProgress, showProgressBar } = App.ui;
    const { showResults } = App.results;

    function range(from, to) {
        return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    }

    function validateRange(from, to) {
        if (isNaN(from) || isNaN(to)) {
            showError('Please enter valid page numbers.');
            return false;
        }
        if (from < 1 || to > state.totalPages) {
            showError(`Page numbers must be between 1 and ${state.totalPages}.`);
            return false;
        }
        if (from > to) {
            showError('"From" page must be less than or equal to "To" page.');
            return false;
        }
        return true;
    }

    function parseCustomRanges(input) {
        if (!input.trim()) {
            showError('Please enter at least one range.');
            return null;
        }
        try {
            const parts = input.split(',').map(s => s.trim()).filter(Boolean);
            return parts.map(part => {
                if (part.includes('-')) {
                    const [a, b] = part.split('-').map(Number);
                    if (isNaN(a) || isNaN(b) || a < 1 || b > state.totalPages || a > b)
                        throw new Error(`Invalid range: ${part}`);
                    return { label: `${a}-${b}`, pages: range(a - 1, b - 1) };
                } else {
                    const n = Number(part);
                    if (isNaN(n) || n < 1 || n > state.totalPages)
                        throw new Error(`Invalid page: ${part}`);
                    return { label: `${n}`, pages: [n - 1] };
                }
            });
        } catch (e) {
            showError(e.message);
            return null;
        }
    }

    function buildJobs() {
        if (state.currentTab === 'range') {
            const from = parseInt(document.getElementById('fromPage').value);
            const to = parseInt(document.getElementById('toPage').value);
            if (!validateRange(from, to)) return null;
            return [{ name: `split_pages_${from}-${to}.pdf`, pages: range(from - 1, to - 1) }];
        }

        if (state.currentTab === 'custom') {
            const input = document.getElementById('customRanges').value;
            const parsed = parseCustomRanges(input);
            if (!parsed) return null;
            return parsed.map(({ label, pages }) => ({ name: `split_pages_${label}.pdf`, pages }));
        }

        if (state.currentTab === 'all') {
            return [...Array(state.totalPages).keys()].map(i => ({
                name: `page_${String(i + 1).padStart(3, '0')}.pdf`,
                pages: [i],
            }));
        }

        if (state.currentTab === 'visual') {
            if (state.selectedPages.size === 0) {
                showError('Please select at least one page.');
                return null;
            }
            const sorted = [...state.selectedPages].sort((a, b) => a - b);
            return [{ name: 'split_selected_pages.pdf', pages: sorted.map(p => p - 1) }];
        }

        return null;
    }

    async function doSplit() {
        if (!state.pdfDoc) return;

        showError('');
        clearResults();
        setProgress(0, '');

        const btn = document.getElementById('splitBtn');
        btn.disabled = true;

        try {
            const jobs = buildJobs();
            if (!jobs) { btn.disabled = false; return; }

            state.generatedFiles = [];
            showProgressBar(true);

            for (let i = 0; i < jobs.length; i++) {
                const job = jobs[i];
                setProgress(
                    Math.round(((i + 1) / jobs.length) * 100),
                    `Processing ${i + 1} of ${jobs.length}...`
                );
                const newPdf = await PDFLib.PDFDocument.create();
                const copied = await newPdf.copyPages(state.pdfDoc, job.pages);
                copied.forEach(p => newPdf.addPage(p));
                state.generatedFiles.push({ name: job.name, bytes: await newPdf.save() });
            }

            setProgress(100, 'Complete!');
            showResults();
        } catch (err) {
            showError('An error occurred while splitting. ' + err.message);
            console.error(err);
        }

        btn.disabled = false;
    }

    return { doSplit };
})();
