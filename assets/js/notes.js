(function () {
    const config = window.BI_NOTES_CONFIG || {};
    const storagePrefix = 'bi-notes:';
    const sharedSpace = config.sharedSpace || 'shared';
    const supabaseUrl = config.supabaseUrl || '';
    const supabaseAnonKey = config.supabaseAnonKey || '';
    const savedLabel = 'Saved';
    const typingLabel = 'Saving...';
    let syncEnabled = true;
    let syncStatus;
    const remoteTimers = {};

    function makeKey(type, id) {
        return storagePrefix + type + ':' + id;
    }

    function setSyncStatus(message) {
        if (syncStatus) {
            syncStatus.textContent = message;
        }
    }

    function remoteId(key) {
        return sharedSpace + '|' + key;
    }

    async function supabaseRequest(path, options) {
        const requestOptions = options || {};
        const response = await fetch(supabaseUrl + '/rest/v1/' + path, Object.assign({}, requestOptions, {
            headers: {
                apikey: supabaseAnonKey,
                Authorization: 'Bearer ' + supabaseAnonKey,
                'Content-Type': 'application/json',
                ...(requestOptions.headers || {})
            }
        }));

        if (!response.ok) {
            throw new Error(await response.text());
        }

        if (response.status === 204) {
            return null;
        }

        return response.json();
    }

    function saveRemote(key, content, status) {
        if (!syncEnabled) {
            return;
        }

        status.textContent = 'Cloud saving...';
        clearTimeout(remoteTimers[key]);
        remoteTimers[key] = setTimeout(async function () {
            try {
                await supabaseRequest('study_notes?on_conflict=id', {
                    method: 'POST',
                    headers: {
                        Prefer: 'resolution=merge-duplicates,return=minimal'
                    },
                    body: JSON.stringify([{
                        id: remoteId(key),
                        passcode: sharedSpace,
                        content: content,
                        updated_at: new Date().toISOString()
                    }])
                });
                status.textContent = 'Saved to cloud';
                setSyncStatus('Synced');
            } catch (error) {
                console.error(error);
                status.textContent = 'Cloud save failed';
                setSyncStatus('Sync error');
            }
        }, 550);
    }

    async function loadRemoteNotes() {
        syncEnabled = true;
        setSyncStatus('Loading...');

        try {
            const rows = await supabaseRequest('study_notes?select=id,content&passcode=eq.' + encodeURIComponent(sharedSpace));
            const remoteNotes = new Map(rows.map(function (row) {
                return [row.id.replace(sharedSpace + '|', ''), row.content || ''];
            }));

            document.querySelectorAll('.study-note').forEach(function (note) {
                const key = note.dataset.noteKey;
                const textarea = note.querySelector('textarea');
                const status = note.querySelector('.study-note-status');
                const button = Array.from(document.querySelectorAll('[data-note-toggle]')).find(function (item) {
                    return item.dataset.noteToggle === key;
                });
                const remoteContent = remoteNotes.get(key);

                if (remoteContent !== undefined) {
                    textarea.value = remoteContent;
                    localStorage.setItem(key, remoteContent);
                    if (remoteContent.trim()) {
                        note.classList.add('open');
                    }
                } else if (textarea.value.trim()) {
                    saveRemote(key, textarea.value, status);
                }

                if (button) {
                    button.textContent = textarea.value.trim() ? 'Note saved' : 'Note';
                }
                status.textContent = textarea.value.trim() ? 'Saved to cloud' : savedLabel;
            });

            setSyncStatus('Synced');
        } catch (error) {
            console.error(error);
            syncEnabled = false;
            setSyncStatus('Sync failed');
        }
    }

    function safeId(text, index) {
        return (text || 'note-' + index)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 70) || 'note-' + index;
    }

    function makeNoteBox(key, title, placeholder, isCollapsible) {
        const note = document.createElement('div');
        note.className = isCollapsible ? 'study-note collapsible' : 'study-note';
        note.dataset.noteKey = key;

        const header = document.createElement('div');
        header.className = 'study-note-header';

        const label = document.createElement('div');
        label.className = 'study-note-title';
        label.textContent = title;

        const status = document.createElement('div');
        status.className = 'study-note-status';
        status.textContent = savedLabel;

        const textarea = document.createElement('textarea');
        textarea.value = localStorage.getItem(key) || '';
        textarea.placeholder = placeholder;
        textarea.setAttribute('aria-label', title);

        let timer;
        textarea.addEventListener('input', function () {
            status.textContent = typingLabel;
            clearTimeout(timer);
            timer = setTimeout(function () {
                localStorage.setItem(key, textarea.value);
                status.textContent = savedLabel;
                saveRemote(key, textarea.value, status);
            }, 250);
        });

        header.append(label, status);
        note.append(header, textarea);
        return note;
    }

    function makeToggleButton(key) {
        const button = document.createElement('button');
        button.className = 'topic-note-toggle';
        button.type = 'button';
        button.dataset.noteToggle = key;
        button.textContent = localStorage.getItem(key) ? 'Note saved' : 'Note';
        return button;
    }

    function connectToggle(button, note) {
        button.addEventListener('click', function () {
            note.classList.toggle('open');
            if (note.classList.contains('open')) {
                note.querySelector('textarea').focus();
            }
        });

        note.querySelector('textarea').addEventListener('input', function () {
            button.textContent = this.value.trim() ? 'Note saved' : 'Note';
        });
    }

    document.querySelectorAll('.lect-header[id]').forEach(function (header) {
        const title = header.querySelector('h2') ? header.querySelector('h2').textContent.trim() : header.id;
        const key = makeKey('lecture', header.id);
        const button = makeToggleButton(key);
        const note = makeNoteBox(key, 'My notes - ' + title, 'Type your private study notes here. They autosave in this browser.', true);
        if (localStorage.getItem(key)) {
            note.classList.add('open');
        }

        header.appendChild(button);
        header.insertAdjacentElement('afterend', note);
        connectToggle(button, note);
    });

    document.querySelectorAll('.container h3').forEach(function (heading, index) {
        const headingText = heading.textContent.trim();
        const nearestLecture = heading.closest('[class^="s"]');
        const lectureId = nearestLecture && nearestLecture.querySelector('.lect-header[id]')
            ? nearestLecture.querySelector('.lect-header[id]').id
            : 'general';
        const topicId = safeId(headingText, index);
        const key = makeKey('topic', lectureId + ':' + topicId);
        const button = makeToggleButton(key);

        const note = makeNoteBox(key, 'My topic note', 'Add a quick note for this topic.', true);
        if (localStorage.getItem(key)) {
            note.classList.add('open');
        }

        heading.appendChild(button);
        heading.insertAdjacentElement('afterend', note);
        connectToggle(button, note);
    });

    const tools = document.createElement('div');
    tools.className = 'notes-tools';

    const syncButton = document.createElement('button');
    syncButton.type = 'button';
    syncButton.textContent = 'Refresh notes';
    syncButton.addEventListener('click', function () {
        loadRemoteNotes();
    });

    syncStatus = document.createElement('span');
    syncStatus.className = 'sync-status';
    syncStatus.textContent = 'Loading...';

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = 'Export notes';
    exportButton.addEventListener('click', function () {
        const notes = {};
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key && key.startsWith(storagePrefix)) {
                notes[key] = localStorage.getItem(key);
            }
        }
        const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'bi-study-notes.json';
        link.click();
        URL.revokeObjectURL(link.href);
    });

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = 'Clear notes';
    clearButton.addEventListener('click', function () {
        if (!confirm('Clear all saved study notes from this browser and cloud?')) {
            return;
        }
        document.querySelectorAll('.study-note textarea').forEach(function (textarea) {
            const note = textarea.closest('.study-note');
            const status = note.querySelector('.study-note-status');
            const key = note.dataset.noteKey;
            textarea.value = '';
            localStorage.removeItem(key);
            saveRemote(key, '', status);
        });
        document.querySelectorAll('.topic-note-toggle').forEach(function (button) {
            button.textContent = 'Note';
        });
    });

    tools.append(syncButton, syncStatus, exportButton, clearButton);
    document.body.appendChild(tools);

    loadRemoteNotes();
        }());
