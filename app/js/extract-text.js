// Extract Text — main logic
// Two modes:
//   Digital: uses pdfjs getTextContent() — instant, works on text-based PDFs
//   OCR:     renders each page to canvas via pdfjs, feeds to Tesseract.js — for scanned PDFs

(function () {
    'use strict';

    // ── pdfjs worker ──────────────────────────────────────────────────────────
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

    // ── State ─────────────────────────────────────────────────────────────────
    var state = {
        pdfDoc: null,
        fileName: '',
        mode: 'digital',        // 'digital' | 'ocr'
        tesseractReady: false,  // true once the script has loaded
        tWorker: null           // active Tesseract worker (terminated after each run)
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var results = document.getElementById('results');
    var fileNameEl = document.getElementById('fileName');
    var pageCountEl = document.getElementById('pageCountLabel');
    var modeDigital = document.getElementById('modeDigital');
    var modeOcr = document.getElementById('modeOcr');
    var ocrOptions = document.getElementById('ocrOptions');
    var ocrLang = document.getElementById('ocrLang');
    var rangeInput = document.getElementById('rangeInput');
    var extractBtn = document.getElementById('extractBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var textOutput = document.getElementById('textOutput');
    var charCount = document.getElementById('charCount');
    var copyBtn = document.getElementById('copyBtn');
    var downloadBtn = document.getElementById('downloadBtn');
    var extractAgainBtn = document.getElementById('extractAgainBtn');

    // ── Drop-zone ─────────────────────────────────────────────────────────────
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        var file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
        fileInput.value = '';
    });

    // ── File load ─────────────────────────────────────────────────────────────
    function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showError('Please select a PDF file.');
            return;
        }
        hideError();
        state.fileName = file.name.replace(/\.pdf$/i, '');
        fileNameEl.textContent = file.name;

        var reader = new FileReader();
        reader.onload = function (e) {
            loadPdf(new Uint8Array(e.target.result));
        };
        reader.readAsArrayBuffer(file);
    }

    function loadPdf(bytes) {
        pdfjsLib.getDocument({ data: bytes }).promise
            .then(function (pdf) {
                state.pdfDoc = pdf;
                var n = pdf.numPages;
                pageCountEl.textContent = n + ' page' + (n !== 1 ? 's' : '');
                dropZone.style.display = 'none';
                optionsPanel.style.display = 'block';
                // Reset results from a previous run
                results.style.display = 'none';
                textOutput.value = '';
                charCount.textContent = '';
            })
            .catch(function (err) {
                showError('Could not read PDF: ' + err.message);
            });
    }

    // ── Mode toggle ───────────────────────────────────────────────────────────
    modeDigital.addEventListener('click', function () { setMode('digital'); });
    modeOcr.addEventListener('click', function () { setMode('ocr'); });

    function setMode(m) {
        state.mode = m;
        modeDigital.classList.toggle('active', m === 'digital');
        modeOcr.classList.toggle('active', m === 'ocr');
        ocrOptions.classList.toggle('visible', m === 'ocr');
        if (m === 'ocr') loadTesseractScript();
    }

    // Lazily inject Tesseract.js only when OCR mode is first selected
    function loadTesseractScript() {
        if (state.tesseractReady || document.getElementById('tesseractScript')) return;
        var s = document.createElement('script');
        s.id = 'tesseractScript';
        s.src = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';
        s.onload = function () { state.tesseractReady = true; };
        document.head.appendChild(s);
    }

    // ── Page range parser ─────────────────────────────────────────────────────
    // Accepts "1-3, 5, 8-10" → [1,2,3,5,8,9,10].  Blank → all pages.
    function parseRange(str, maxPage) {
        if (!str.trim()) return allPages(maxPage);
        var pages = [];
        str.split(',').forEach(function (part) {
            part = part.trim();
            var rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
            if (rangeMatch) {
                var a = Math.max(1, parseInt(rangeMatch[1], 10));
                var b = Math.min(maxPage, parseInt(rangeMatch[2], 10));
                for (var i = a; i <= b; i++) pages.push(i);
            } else if (/^\d+$/.test(part)) {
                var n = parseInt(part, 10);
                if (n >= 1 && n <= maxPage) pages.push(n);
            }
        });
        // deduplicate and sort
        pages = pages.filter(function (v, i, a) { return a.indexOf(v) === i; });
        pages.sort(function (a, b) { return a - b; });
        return pages.length ? pages : allPages(maxPage);
    }

    function allPages(n) {
        var arr = [];
        for (var i = 1; i <= n; i++) arr.push(i);
        return arr;
    }

    // ── Extract ───────────────────────────────────────────────────────────────
    extractBtn.addEventListener('click', function () {
        if (!state.pdfDoc) return;
        var pages = parseRange(rangeInput.value, state.pdfDoc.numPages);
        if (state.mode === 'ocr') {
            if (!state.tesseractReady) {
                showError('The OCR engine is still loading — please wait a moment and try again.');
                return;
            }
            runOcr(pages);
        } else {
            runDigital(pages);
        }
    });

    // ── Digital extraction (pdfjs getTextContent) ─────────────────────────────
    function runDigital(pages) {
        setExtracting(true);
        var pdf = state.pdfDoc;
        var parts = [];
        var index = 0;

        function next() {
            if (index >= pages.length) {
                setExtracting(false);
                showResults(parts.join('\n\n'));
                return;
            }
            var pageNum = pages[index];
            updateProgress(index, pages.length, 'Page ' + pageNum + '…');

            pdf.getPage(pageNum).then(function (page) {
                return page.getTextContent();
            }).then(function (content) {
                var lines = [];
                var lastY = null;
                content.items.forEach(function (item) {
                    if (item.str === undefined) return;
                    // Insert a newline when the vertical position changes noticeably
                    var y = item.transform[5];
                    if (lastY !== null && Math.abs(y - lastY) > 2) {
                        lines.push('\n');
                    }
                    lines.push(item.str);
                    lastY = y;
                });
                var pageText = lines.join('').trim();
                parts.push('─── Page ' + pageNum + ' ───\n' + (pageText || '(no text on this page)'));
                index++;
                next();
            }).catch(function (err) {
                showError('Error reading page ' + pageNum + ': ' + err.message);
                setExtracting(false);
            });
        }

        next();
    }

    // ── OCR extraction (Tesseract.js) ─────────────────────────────────────────
    function runOcr(pages) {
        setExtracting(true);
        var pdf = state.pdfDoc;
        var lang = ocrLang.value;
        var parts = [];
        var index = 0;

        Tesseract.createWorker(lang, 1, {
            logger: function (m) {
                if (m.status === 'recognizing text') {
                    var pageNum = pages[index] || '…';
                    var overall = ((index + m.progress) / pages.length) * 100;
                    progressBar.style.width = Math.round(overall) + '%';
                    progressLabel.textContent =
                        'OCR page ' + pageNum + ' (' + Math.round(m.progress * 100) + '%)…';
                } else if (m.status === 'loading tesseract core' ||
                    m.status === 'loading language traineddata') {
                    progressLabel.textContent = m.status + '…';
                }
            }
        }).then(function (worker) {
            state.tWorker = worker;

            function next() {
                if (index >= pages.length) {
                    worker.terminate().then(function () {
                        state.tWorker = null;
                        setExtracting(false);
                        showResults(parts.join('\n\n'));
                    });
                    return;
                }
                var pageNum = pages[index];

                // Render page to canvas at 2× scale for better OCR accuracy
                pdf.getPage(pageNum).then(function (page) {
                    var scale = 2;
                    var viewport = page.getViewport({ scale: scale });
                    var canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    var ctx = canvas.getContext('2d');
                    return page.render({ canvasContext: ctx, viewport: viewport }).promise
                        .then(function () { return canvas; });
                }).then(function (canvas) {
                    return worker.recognize(canvas);
                }).then(function (result) {
                    parts.push('─── Page ' + pageNum + ' ───\n' + (result.data.text.trim() || '(no text detected)'));
                    index++;
                    next();
                }).catch(function (err) {
                    worker.terminate();
                    state.tWorker = null;
                    showError('OCR failed on page ' + pageNum + ': ' + err.message);
                    setExtracting(false);
                });
            }

            next();
        }).catch(function (err) {
            showError('Could not start OCR engine: ' + err.message);
            setExtracting(false);
        });
    }

    // ── Results ───────────────────────────────────────────────────────────────
    function showResults(text) {
        progressBar.style.width = '100%';
        setTimeout(function () {
            progressWrap.style.display = 'none';
            progressLabel.style.display = 'none';
            progressBar.style.width = '0%';
        }, 300);
        textOutput.value = text;
        updateCharCount();
        results.style.display = 'block';
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function updateCharCount() {
        var n = textOutput.value.length;
        charCount.textContent = n === 0 ? '' : n.toLocaleString() + ' characters';
    }

    textOutput.addEventListener('input', updateCharCount);

    // ── Copy ──────────────────────────────────────────────────────────────────
    copyBtn.addEventListener('click', function () {
        if (!textOutput.value) return;
        navigator.clipboard.writeText(textOutput.value).then(function () {
            var span = copyBtn.querySelector('[data-i18n="ext.copy"]') || copyBtn;
            var orig = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓ Copied!';
            copyBtn.classList.add('copied');
            setTimeout(function () {
                copyBtn.innerHTML = orig;
                copyBtn.classList.remove('copied');
            }, 2000);
        });
    });

    // ── Download .txt ─────────────────────────────────────────────────────────
    downloadBtn.addEventListener('click', function () {
        if (!textOutput.value) return;
        var blob = new Blob([textOutput.value], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = state.fileName + '.txt';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    });

    // ── Reset ─────────────────────────────────────────────────────────────────
    startOverBtn.addEventListener('click', fullReset);
    extractAgainBtn.addEventListener('click', fullReset);

    function fullReset() {
        if (state.tWorker) {
            state.tWorker.terminate();
            state.tWorker = null;
        }
        state.pdfDoc = null;
        state.fileName = '';
        textOutput.value = '';
        charCount.textContent = '';
        hideError();
        results.style.display = 'none';
        optionsPanel.style.display = 'none';
        progressWrap.style.display = 'none';
        progressLabel.style.display = 'none';
        progressBar.style.width = '0%';
        extractBtn.disabled = false;
        startOverBtn.disabled = false;
        dropZone.style.display = 'flex';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function updateProgress(done, total, label) {
        var pct = Math.round((done / total) * 100);
        progressBar.style.width = pct + '%';
        progressLabel.textContent = 'Extracting ' + label;
    }

    function setExtracting(on) {
        extractBtn.disabled = on;
        startOverBtn.disabled = on;
        progressWrap.style.display = on ? 'block' : 'none';
        progressLabel.style.display = on ? 'block' : 'none';
        if (!on) progressBar.style.width = '0%';
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }

    function hideError() {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    // Init
    optionsPanel.style.display = 'none';
    results.style.display = 'none';
    progressWrap.style.display = 'none';
    progressLabel.style.display = 'none';
    hideError();

}());
