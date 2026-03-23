// Image to PDF — main logic
// Reads JPG/PNG image files, sorts them via drag-and-drop, then builds a PDF
// using pdf-lib with configurable page size and margin.

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────────────────────
    var state = {
        /** @type {{ id: number, file: File, dataUrl: string }[]} */
        items: [],
        nextId: 0,
        draggingId: null
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var imagesPanel = document.getElementById('imagesPanel');
    var results = document.getElementById('results');
    var fileCountBadge = document.getElementById('fileCountBadge');
    var imgList = document.getElementById('imgList');
    var pageSizeSelect = document.getElementById('pageSizeSelect');
    var marginSelect = document.getElementById('marginSelect');
    var convertBtn = document.getElementById('convertBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var resultFiles = document.getElementById('resultFiles');
    var convertAgainBtn = document.getElementById('convertAgainBtn');

    // ── Drop-zone listeners ───────────────────────────────────────────────────
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
        addFiles(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files.length) addFiles(Array.from(fileInput.files));
        fileInput.value = '';
    });

    // ── Add files ─────────────────────────────────────────────────────────────
    function addFiles(files) {
        var valid = files.filter(function (f) {
            return f.type === 'image/jpeg' || f.type === 'image/png';
        });
        if (valid.length === 0) {
            showError('Please add JPG or PNG images only.');
            return;
        }
        hideError();

        var pending = valid.length;
        valid.forEach(function (file) {
            var reader = new FileReader();
            reader.onload = function (e) {
                state.items.push({
                    id: state.nextId++,
                    file: file,
                    dataUrl: e.target.result
                });
                pending--;
                if (pending === 0) {
                    renderList();
                    if (state.items.length === valid.length) {
                        // First batch — show panel
                        dropZone.style.display = 'none';
                        imagesPanel.style.display = 'block';
                    }
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // ── Render file list ──────────────────────────────────────────────────────
    function renderList() {
        imgList.innerHTML = '';
        fileCountBadge.textContent = state.items.length;

        state.items.forEach(function (item, index) {
            var li = document.createElement('li');
            li.className = 'img-item';
            li.dataset.id = item.id;
            li.draggable = true;
            li.innerHTML =
                '<span class="drag-handle" title="Drag to reorder">⠿</span>' +
                '<img class="img-thumb" src="' + item.dataUrl + '" alt="" />' +
                '<span class="file-order-badge">' + (index + 1) + '</span>' +
                '<span class="img-meta">' +
                '<span class="img-item-name">' + escapeHtml(item.file.name) + '</span>' +
                '<span class="img-item-size">' + formatSize(item.file.size) + '</span>' +
                '</span>' +
                '<button class="btn-remove" data-remove="' + item.id + '" title="Remove">✕</button>';

            // Drag-and-drop reorder
            li.addEventListener('dragstart', function (e) {
                state.draggingId = item.id;
                li.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            li.addEventListener('dragend', function () {
                li.classList.remove('dragging');
                state.draggingId = null;
                document.querySelectorAll('.img-item.drag-over').forEach(function (el) {
                    el.classList.remove('drag-over');
                });
            });
            li.addEventListener('dragover', function (e) {
                e.preventDefault();
                li.classList.add('drag-over');
            });
            li.addEventListener('dragleave', function () {
                li.classList.remove('drag-over');
            });
            li.addEventListener('drop', function (e) {
                e.preventDefault();
                li.classList.remove('drag-over');
                reorderItems(state.draggingId, item.id);
            });

            // Remove button
            li.querySelector('[data-remove]').addEventListener('click', function () {
                removeItem(item.id);
            });

            imgList.appendChild(li);
        });
    }

    function removeItem(id) {
        state.items = state.items.filter(function (it) { return it.id !== id; });
        if (state.items.length === 0) {
            fullReset();
        } else {
            renderList();
        }
    }

    function reorderItems(fromId, toId) {
        if (fromId === toId) return;
        var fromIdx = state.items.findIndex(function (it) { return it.id === fromId; });
        var toIdx = state.items.findIndex(function (it) { return it.id === toId; });
        if (fromIdx === -1 || toIdx === -1) return;
        var moved = state.items.splice(fromIdx, 1)[0];
        state.items.splice(toIdx, 0, moved);
        renderList();
    }

    // ── Convert ───────────────────────────────────────────────────────────────
    convertBtn.addEventListener('click', function () {
        if (state.items.length === 0) return;
        buildPdf();
    });

    function buildPdf() {
        convertBtn.disabled = true;
        startOverBtn.disabled = true;
        progressWrap.style.display = 'block';
        progressLabel.style.display = 'block';

        var pageSize = pageSizeSelect.value;            // 'auto' | 'a4' | 'letter'
        var margin = parseInt(marginSelect.value, 10); // px in PDF points
        var items = state.items.slice();

        // Dimensions for standard page sizes (in PDF points: 1pt = 1/72 inch)
        var PAGE_SIZES = {
            a4: { width: 595.28, height: 841.89 },
            letter: { width: 612, height: 792 }
        };

        PDFLib.PDFDocument.create().then(function (pdfDoc) {
            var index = 0;

            function processNext() {
                if (index >= items.length) {
                    progressBar.style.width = '100%';
                    progressLabel.textContent = '';
                    return pdfDoc.save().then(function (bytes) {
                        finalize(bytes);
                    });
                }

                var item = items[index];
                var pct = Math.round((index / items.length) * 100);
                progressBar.style.width = pct + '%';
                progressLabel.textContent = 'Processing image ' + (index + 1) + ' of ' + items.length + '…';

                return loadImage(item).then(function (info) {
                    var embedPromise = info.type === 'png'
                        ? pdfDoc.embedPng(info.bytes)
                        : pdfDoc.embedJpg(info.bytes);

                    return embedPromise.then(function (img) {
                        var iw = img.width;
                        var ih = img.height;

                        var pageW, pageH;

                        if (pageSize === 'auto') {
                            pageW = iw + margin * 2;
                            pageH = ih + margin * 2;
                        } else {
                            var ps = PAGE_SIZES[pageSize];
                            pageW = ps.width;
                            pageH = ps.height;
                        }

                        var page = pdfDoc.addPage([pageW, pageH]);

                        // Scale image to fit within margins
                        var drawW = pageW - margin * 2;
                        var drawH = pageH - margin * 2;
                        var ratio = Math.min(drawW / iw, drawH / ih);
                        var finalW = iw * ratio;
                        var finalH = ih * ratio;

                        // Center the image on the page
                        var x = margin + (drawW - finalW) / 2;
                        var y = margin + (drawH - finalH) / 2;

                        page.drawImage(img, {
                            x: x,
                            y: y,
                            width: finalW,
                            height: finalH
                        });

                        index++;
                        return processNext();
                    });
                });
            }

            return processNext();
        }).catch(function (err) {
            showError('PDF creation failed: ' + err.message);
            convertBtn.disabled = false;
            startOverBtn.disabled = false;
        });
    }

    function loadImage(item) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (e) {
                var bytes = new Uint8Array(e.target.result);
                var type = item.file.type === 'image/png' ? 'png' : 'jpeg';
                resolve({ bytes: bytes, type: type });
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(item.file);
        });
    }

    function finalize(bytes) {
        progressWrap.style.display = 'none';
        progressLabel.style.display = 'none';
        imagesPanel.style.display = 'none';
        resultFiles.innerHTML = '';

        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);

        var wrap = document.createElement('div');
        wrap.className = 'result-file';
        var a = document.createElement('a');
        a.href = url;
        a.download = 'images.pdf';
        a.className = 'btn-download';
        a.textContent = '⬇ Download PDF';
        wrap.appendChild(a);
        resultFiles.appendChild(wrap);

        results.style.display = 'block';
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── Reset ─────────────────────────────────────────────────────────────────
    startOverBtn.addEventListener('click', function () { fullReset(); });
    convertAgainBtn.addEventListener('click', function () { fullReset(); });

    function fullReset() {
        state.items = [];
        state.nextId = 0;
        imgList.innerHTML = '';
        resultFiles.innerHTML = '';
        fileCountBadge.textContent = '0';
        hideError();
        results.style.display = 'none';
        imagesPanel.style.display = 'none';
        dropZone.style.display = 'flex';
        convertBtn.disabled = false;
        startOverBtn.disabled = false;
        progressBar.style.width = '0%';
        progressWrap.style.display = 'none';
        progressLabel.style.display = 'none';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    imagesPanel.style.display = 'none';
    results.style.display = 'none';
    progressWrap.style.display = 'none';
    progressLabel.style.display = 'none';
    hideError();

}());
