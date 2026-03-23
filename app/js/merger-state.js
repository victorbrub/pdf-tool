const mergerState = {
    files: [],   // [{ id, name, pageCount, pdfBytes (Uint8Array), thumbnail (HTMLCanvasElement) }]
    _nextId: 0,

    add(entry) {
        entry.id = this._nextId++;
        this.files.push(entry);
    },

    remove(id) {
        this.files = this.files.filter(f => f.id !== id);
    },

    reorder(fromIndex, toIndex) {
        const [item] = this.files.splice(fromIndex, 1);
        this.files.splice(toIndex, 0, item);
    },

    clear() {
        this.files = [];
    },
};
