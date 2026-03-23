let _dragSrcIndex = null;

function renderFileList() {
    const list = document.getElementById('mergerFileList');
    const files = mergerState.files;
    const hasFiles = files.length > 0;

    // toggle drop zone / file section
    document.getElementById('mergerDropZone').style.display = hasFiles ? 'none' : '';
    const fileSection = document.getElementById('mergerFileSection');
    if (hasFiles) fileSection.classList.add('visible');
    else fileSection.classList.remove('visible');

    // merge button state
    document.getElementById('mergeBtn').disabled = files.length < 2;

    // file count badge
    const t = translations[localStorage.getItem('lang') || 'en'];
    const plural = files.length !== 1;
    document.getElementById('fileCountBadge').textContent =
        files.length + ' ' + (t ? (plural ? t['merger.files_plural'] : t['merger.files_singular']) : (plural ? 'files' : 'file'));

    list.innerHTML = '';
    if (!hasFiles) return;

    files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'merger-file-item';
        item.draggable = true;
        item.dataset.index = index;

        // drag handle
        const handle = document.createElement('div');
        handle.className = 'drag-handle';
        handle.title = 'Drag to reorder';
        handle.textContent = '⠿';

        // thumbnail
        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'file-thumb-wrap';
        const canvas = document.createElement('canvas');
        canvas.width = 60;
        canvas.height = 84;
        if (file.thumbnail) {
            canvas.getContext('2d').drawImage(file.thumbnail, 0, 0, 60, 84);
        }
        thumbWrap.appendChild(canvas);

        // meta
        const meta = document.createElement('div');
        meta.className = 'file-meta';
        const nameEl = document.createElement('span');
        nameEl.className = 'file-item-name';
        nameEl.title = file.name;
        nameEl.textContent = file.name;
        const pagesEl = document.createElement('span');
        pagesEl.className = 'file-item-pages';
        pagesEl.textContent = file.pageCount + (file.pageCount !== 1 ? ' pages' : ' page');
        meta.appendChild(nameEl);
        meta.appendChild(pagesEl);

        // order badge
        const badge = document.createElement('div');
        badge.className = 'file-order-badge';
        badge.textContent = index + 1;

        // remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.title = 'Remove';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => {
            mergerState.remove(file.id);
            hideMergerError();
            renderFileList();
        });

        item.appendChild(handle);
        item.appendChild(thumbWrap);
        item.appendChild(meta);
        item.appendChild(badge);
        item.appendChild(removeBtn);

        // ── drag-and-drop reorder ──
        item.addEventListener('dragstart', e => {
            _dragSrcIndex = parseInt(e.currentTarget.dataset.index);
            // defer so the dragging style doesn't affect the drag image
            setTimeout(() => e.currentTarget.classList.add('dragging'), 0);
        });

        item.addEventListener('dragover', e => {
            e.preventDefault();
            document.querySelectorAll('.merger-file-item').forEach(el => el.classList.remove('drag-over'));
            e.currentTarget.classList.add('drag-over');
        });

        item.addEventListener('dragleave', e => {
            e.currentTarget.classList.remove('drag-over');
        });

        item.addEventListener('drop', e => {
            e.preventDefault();
            const toIndex = parseInt(e.currentTarget.dataset.index);
            if (_dragSrcIndex !== null && _dragSrcIndex !== toIndex) {
                mergerState.reorder(_dragSrcIndex, toIndex);
                renderFileList();
            }
        });

        item.addEventListener('dragend', () => {
            document.querySelectorAll('.merger-file-item').forEach(el => {
                el.classList.remove('dragging', 'drag-over');
            });
            _dragSrcIndex = null;
        });

        list.appendChild(item);
    });
}

function showMergerError(msg) {
    const box = document.getElementById('mergerErrorBox');
    box.textContent = msg;
    box.classList.add('visible');
}

function hideMergerError() {
    document.getElementById('mergerErrorBox').classList.remove('visible');
}

function showMergerResults(fileName, blob) {
    document.getElementById('mergerFileSection').classList.remove('visible');
    const results = document.getElementById('mergerResults');
    results.classList.add('visible');

    const url = URL.createObjectURL(blob);
    document.getElementById('mergedFileName').textContent = fileName;
    const link = document.getElementById('mergedDownloadLink');
    link.href = url;
    link.download = fileName;
}
