/**
 * add-watermark.js
 *
 * Uses pdf-lib only.
 * Draws a diagonal text watermark centered on every page.
 *
 * Options: text, color, font size, opacity, angle.
 */

(function () {
    'use strict';

    /* ── Color definitions (r,g,b in 0-1 range) ── */
    var COLORS = {
        red: { r: 0.80, g: 0.08, b: 0.08 },
        gray: { r: 0.47, g: 0.47, b: 0.47 },
        blue: { r: 0.10, g: 0.30, b: 0.80 },
        black: { r: 0.07, g: 0.07, b: 0.07 },
        orange: { r: 0.88, g: 0.44, b: 0.04 },
        green: { r: 0.10, g: 0.48, b: 0.24 }
    };

    /* ── State ── */
    var state = {
        pdfBytes: null,
        fileName: '',
        pageCount: 0,
        text: 'CONFIDENTIAL',
        color: COLORS.red,
        fontSize: 60,
        opacity: 20,   /* percent */
        angle: 45    /* degrees */
    };

    /* ── DOM ── */
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameEl = document.getElementById('fileName');
    var pageCountEl = document.getElementById('pageCountLabel');
    var wmText = document.getElementById('wmText');
    var sizeSlider = document.getElementById('sizeSlider');
    var sizeValue = document.getElementById('sizeValue');
    var opacitySlider = document.getElementById('opacitySlider');
    var opacityValue = document.getElementById('opacityValue');
    var angleSlider = document.getElementById('angleSlider');
    var angleValue = document.getElementById('angleValue');
    var applyBtn = document.getElementById('applyBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var resultsEl = document.getElementById('results');
    var resultFiles = document.getElementById('resultFiles');
    var applyAgain = document.getElementById('applyAgainBtn');

    /* ── Helpers ── */
    function showError(msg) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
    function clearError() { errorBox.style.display = 'none'; errorBox.textContent = ''; }
    function setProgress(pct, label) {
        progressBar.style.width = pct + '%';
        progressLabel.textContent = label || '';
        progressWrap.style.display = pct >= 0 ? 'block' : 'none';
    }
    function resetButtons() {
        applyBtn.disabled = false; startOverBtn.disabled = false;
        progressWrap.style.display = 'none'; progressBar.style.width = '0%';
        progressLabel.textContent = '';
    }

    /* ── Option controls ── */
    wmText.addEventListener('input', function () { state.text = wmText.value || ' '; });

    document.querySelectorAll('.color-swatch').forEach(function (sw) {
        sw.addEventListener('click', function () {
            document.querySelectorAll('.color-swatch').forEach(function (s) { s.classList.remove('active'); });
            sw.classList.add('active');
            state.color = COLORS[sw.dataset.color] || COLORS.red;
        });
    });

    sizeSlider.addEventListener('input', function () {
        state.fontSize = parseInt(sizeSlider.value, 10);
        sizeValue.textContent = state.fontSize + ' pt';
    });
    opacitySlider.addEventListener('input', function () {
        state.opacity = parseInt(opacitySlider.value, 10);
        opacityValue.textContent = state.opacity + '%';
    });
    angleSlider.addEventListener('input', function () {
        state.angle = parseInt(angleSlider.value, 10);
        angleValue.textContent = state.angle + '°';
    });

    /* ── File handling ── */
    fileInput.addEventListener('change', function () {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault(); dropZone.classList.remove('dragover');
        var f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') { fileInput.value = ''; handleFile(f); }
        else showError('Please drop a PDF file.');
    });

    function handleFile(file) {
        clearError();
        if (!file || file.type !== 'application/pdf') { showError('Only PDF files are supported.'); return; }
        state.fileName = file.name.replace(/\.pdf$/i, '');
        var reader = new FileReader();
        reader.onload = function (e) {
            state.pdfBytes = new Uint8Array(e.target.result);
            PDFLib.PDFDocument.load(state.pdfBytes)
                .then(function (doc) {
                    state.pageCount = doc.getPageCount();
                    fileNameEl.textContent = state.fileName + '.pdf';
                    pageCountEl.textContent = state.pageCount + ' page' + (state.pageCount !== 1 ? 's' : '');
                    dropZone.style.display = 'none';
                    optionsPanel.style.display = 'block';
                    resultsEl.style.display = 'none';
                })
                .catch(function (err) { showError('Could not read PDF: ' + err.message); });
        };
        reader.readAsArrayBuffer(file);
    }

    /* ── Apply watermark ── */
    applyBtn.addEventListener('click', function () {
        clearError();
        var text = state.text.trim();
        if (!text) { showError('Please enter watermark text.'); wmText.focus(); return; }

        applyBtn.disabled = true;
        startOverBtn.disabled = true;
        setProgress(10, 'Loading PDF…');

        PDFLib.PDFDocument.load(state.pdfBytes)
            .then(function (doc) {
                setProgress(30, 'Embedding font…');
                return doc.embedFont(PDFLib.StandardFonts.HelveticaBold).then(function (font) {
                    var pages = doc.getPages();
                    var fontSize = state.fontSize;
                    var angleRad = (state.angle * Math.PI) / 180;
                    var opacity = state.opacity / 100;
                    var color = PDFLib.rgb(state.color.r, state.color.g, state.color.b);

                    pages.forEach(function (page) {
                        var sz = page.getSize();
                        var w = sz.width;
                        var h = sz.height;

                        var textWidth = font.widthOfTextAtSize(text, fontSize);

                        /*
                         * Position the text so its visual center lands at the page center.
                         * pdf-lib rotates around the bottom-left anchor (x, y).
                         * To center the rotated text:
                         * cx = x + (textWidth/2)*cos(a) - (fontSize/4)*sin(a)
                         * cy = y + (textWidth/2)*sin(a) + (fontSize/4)*cos(a)
                         * Solving for x, y:
                         */
                        var cx = w / 2;
                        var cy = h / 2;
                        var x = cx - (textWidth / 2) * Math.cos(angleRad) + (fontSize / 4) * Math.sin(angleRad);
                        var y = cy - (textWidth / 2) * Math.sin(angleRad) - (fontSize / 4) * Math.cos(angleRad);

                        page.drawText(text, {
                            x: x,
                            y: y,
                            size: fontSize,
                            font: font,
                            color: color,
                            rotate: PDFLib.degrees(state.angle),
                            opacity: opacity
                        });
                    });

                    setProgress(80, 'Saving…');
                    return doc.save();
                });
            })
            .then(function (saved) {
                setProgress(100, '');
                showResults(saved);
            })
            .catch(function (err) {
                showError('Failed: ' + err.message);
                resetButtons();
            });
    });

    /* ── Results ── */
    function showResults(bytes) {
        resetButtons();
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = state.fileName + '_watermarked.pdf';
        a.className = 'btn-primary';
        a.style.cssText = 'display:inline-flex;align-items:center;gap:0.4rem;text-decoration:none;';
        a.textContent = '⬇️ Download PDF';
        resultFiles.innerHTML = '';
        resultFiles.appendChild(a);
        optionsPanel.style.display = 'none';
        resultsEl.style.display = 'block';
    }

    /* ── Start over ── */
    function startOver() {
        state.pdfBytes = null; state.fileName = ''; state.pageCount = 0;
        fileInput.value = '';
        wmText.value = 'CONFIDENTIAL';
        state.text = 'CONFIDENTIAL';
        clearError(); resetButtons();
        resultsEl.style.display = 'none';
        optionsPanel.style.display = 'none';
        dropZone.style.display = 'flex';
    }
    startOverBtn.addEventListener('click', startOver);
    applyAgain.addEventListener('click', startOver);

})();
