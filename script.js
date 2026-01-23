document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const card = document.getElementById('flashcard');
    const cardInner = card.querySelector('.card-inner');
    const cardFrontText = document.getElementById('card-front-text');
    const cardFrontReading = document.getElementById('card-front-reading');
    const cardBackTitle = document.getElementById('card-back-title');
    const cardBackReading = document.getElementById('card-back-reading');
    const cardBackPos = document.getElementById('card-back-pos');
    const cardBackForms = document.getElementById('card-back-forms');
    const formMasu = document.getElementById('form-masu');
    const formTe = document.getElementById('form-te');
    const formNai = document.getElementById('form-nai');
    const formTa = document.getElementById('form-ta');
    const cardBackNotes = document.getElementById('card-back-notes');
    const settingsModal = document.getElementById('settings-modal');
    const settingsHint = document.getElementById('settings-hint');
    const feedbackFlash = document.getElementById('feedback-flash');
    const modeToggle = document.getElementById('mode-toggle');
    const distToggle = document.getElementById('dist-toggle');
    const closeSettings = document.getElementById('close-settings');
    const themeButtons = document.querySelectorAll('.theme-btn');
    const displayModeButtons = document.querySelectorAll('.display-mode-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const answerHints = document.getElementById('answer-hints');
    const btnCorrect = document.getElementById('btn-correct');
    const btnIncorrect = document.getElementById('btn-incorrect');

    // --- State ---
    let vocabData = [];
    let stats = {};
    let currentCard = null;
    let isFlipped = false;
    let mode = 'ja-en';
    let displayMode = 'both'; // 'kanji', 'both', or 'hint'
    let hintRevealed = false;
    let useWeightedDist = true;
    let isLoading = true;

    // Session tracking
    let sessionStats = { correct: 0, incorrect: 0 };

    // Gesture tracking
    let touchStartX = 0;
    let touchStartY = 0;
    let longPressTimer = null;
    let hintTimer = null;
    let hasMoved = false;
    const SWIPE_THRESHOLD = 50;
    const LONG_PRESS_DURATION = 800;

    // --- Theme Management ---
    function initTheme() {
        const savedTheme = localStorage.getItem('vocabTheme');
        if (savedTheme) {
            setTheme(savedTheme);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            setTheme('dark');
        } else {
            setTheme('light');
        }
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('vocabTheme', theme);
        themeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    // --- CSV Parser ---
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            let values = [];
            let currentField = '';
            let inQuotes = false;
            for (let char of line) {
                if (char === '"' && !inQuotes) { inQuotes = true; continue; }
                if (char === '"' && inQuotes) { inQuotes = false; continue; }
                if (char === ',' && !inQuotes) { values.push(currentField); currentField = ''; continue; }
                currentField += char;
            }
            values.push(currentField);
            if (values.length < 2 || !values[0] || !values[1]) { continue; }
            const row = {};
            headers.forEach((header, index) => { row[header] = values[index] ? values[index].trim() : ''; });
            data.push(row);
        }
        return data;
    }

    // --- Data Loading ---
    async function loadVocabData() {
        try {
            const response = await fetch('vocab.csv');
            const csvText = await response.text();
            vocabData = parseCSV(csvText);
        } catch (error) {
            console.error("Error loading vocab.csv:", error);
            cardFrontText.textContent = "Error loading vocabulary";
        }
    }

    function loadStats() {
        const statsJSON = localStorage.getItem('vocabStats');
        stats = statsJSON ? JSON.parse(statsJSON) : {};
        vocabData.forEach(word => {
            const key = word.Kanji || word.Japanese; // Support both old and new column names
            if (key && !stats[key]) {
                stats[key] = { correct: 0, incorrect: 0 };
            }
        });
    }

    function saveStats() {
        localStorage.setItem('vocabStats', JSON.stringify(stats));
    }

    function loadSettings() {
        const savedMode = localStorage.getItem('vocabMode');
        const savedDist = localStorage.getItem('vocabDist');
        const savedDisplayMode = localStorage.getItem('vocabDisplayMode');

        if (savedMode === 'en-ja') {
            mode = 'en-ja';
            modeToggle.checked = true;
        }
        if (savedDist === 'false') {
            useWeightedDist = false;
            distToggle.checked = false;
        }
        if (savedDisplayMode && ['kanji', 'both', 'hint'].includes(savedDisplayMode)) {
            displayMode = savedDisplayMode;
        }
        updateDisplayModeButtons();
    }

    function updateDisplayModeButtons() {
        displayModeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.display === displayMode);
        });
    }

    function saveSettings() {
        localStorage.setItem('vocabMode', mode);
        localStorage.setItem('vocabDist', useWeightedDist.toString());
        localStorage.setItem('vocabDisplayMode', displayMode);
    }

    // --- Streak & History ---
    function updateStreak() {
        const today = new Date().toISOString().split('T')[0];
        const streakData = JSON.parse(localStorage.getItem('streakData') || '{}');

        if (streakData.lastPracticeDate === today) return;

        const lastDate = streakData.lastPracticeDate ? new Date(streakData.lastPracticeDate) : null;
        const todayDate = new Date(today);

        if (lastDate) {
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                streakData.currentStreak = (streakData.currentStreak || 0) + 1;
            } else if (diffDays > 1) {
                streakData.currentStreak = 1;
            }
        } else {
            streakData.currentStreak = 1;
        }

        streakData.lastPracticeDate = today;
        localStorage.setItem('streakData', JSON.stringify(streakData));
    }

    function saveSessionHistory() {
        if (sessionStats.correct === 0 && sessionStats.incorrect === 0) return;

        const sessionHistory = JSON.parse(localStorage.getItem('sessionHistory') || '[]');
        sessionHistory.push({
            date: new Date().toISOString(),
            correct: sessionStats.correct,
            incorrect: sessionStats.incorrect
        });

        if (sessionHistory.length > 100) sessionHistory.shift();
        localStorage.setItem('sessionHistory', JSON.stringify(sessionHistory));
    }

    window.addEventListener('beforeunload', saveSessionHistory);

    // --- Card Selection ---
    function getRandomCard() {
        return vocabData[Math.floor(Math.random() * vocabData.length)];
    }

    function getWeightedRandomCard() {
        const weightedPool = [];
        vocabData.forEach(word => {
            const key = word.Kanji || word.Japanese;
            const wordStats = stats[key];
            const weight = 10 + ((wordStats?.incorrect || 0) * 5);
            for (let i = 0; i < weight; i++) {
                weightedPool.push(word);
            }
        });
        return weightedPool[Math.floor(Math.random() * weightedPool.length)];
    }

    // --- Card Display ---
    function renderCurrentCard() {
        if (!currentCard) return;

        const kanji = currentCard.Kanji || currentCard.Japanese || '';
        const reading = currentCard['Reading (Kana)'] || '';
        const english = currentCard.English || '';
        const pos = currentCard['Part of Speech'] || '';
        const masu = currentCard['Polite (Masu-form)'] || '';
        const te = currentCard['Te-form'] || '';
        const nai = currentCard['Short Negative (Nai)'] || '';
        const ta = currentCard['Short Past (Ta)'] || '';
        const notes = currentCard['Usage/Notes'] || currentCard.Description || '';

        if (mode === 'ja-en') {
            // Front card display based on displayMode
            if (displayMode === 'kanji') {
                cardFrontText.textContent = kanji;
                cardFrontReading.textContent = '';
                cardFrontReading.classList.remove('visible');
            } else if (displayMode === 'both') {
                cardFrontText.textContent = kanji;
                cardFrontReading.textContent = reading || '';
                cardFrontReading.classList.add('visible');
            } else if (displayMode === 'hint') {
                cardFrontText.textContent = kanji;
                cardFrontReading.textContent = reading || '';
                cardFrontReading.classList.remove('visible'); // Hidden until first tap
            }
            cardBackTitle.textContent = english;
            cardBackReading.textContent = reading ? `${kanji} (${reading})` : kanji;
        } else {
            // English -> Japanese mode: no reading on front needed
            cardFrontText.textContent = english;
            cardFrontReading.textContent = '';
            cardFrontReading.classList.remove('visible');
            cardBackTitle.textContent = kanji;
            cardBackReading.textContent = reading || '';
        }

        // Part of speech with color coding
        cardBackPos.textContent = pos;
        const posLower = pos.toLowerCase();
        if (posLower.includes('verb')) {
            cardBackPos.dataset.pos = 'verb';
        } else if (posLower.includes('adjective')) {
            cardBackPos.dataset.pos = 'adjective';
        } else if (posLower.includes('noun')) {
            cardBackPos.dataset.pos = 'noun';
        } else if (posLower.includes('adverb')) {
            cardBackPos.dataset.pos = 'adverb';
        } else {
            cardBackPos.dataset.pos = '';
        }

        // Conjugation forms
        formMasu.textContent = masu;
        formTe.textContent = te;
        formNai.textContent = nai;
        formTa.textContent = ta;

        // Check if any forms exist (not just "-" which means N/A)
        const hasForms = [masu, te, nai, ta].some(f => f && f !== '-');
        cardBackForms.classList.toggle('hidden', !hasForms);

        // Usage notes
        cardBackNotes.textContent = notes;
    }

    function loadNextCardData() {
        currentCard = useWeightedDist ? getWeightedRandomCard() : getRandomCard();
        renderCurrentCard();
        isLoading = false;
    }

    function showNextCard() {
        isLoading = true;
        isFlipped = false;
        hintRevealed = false;

        cardFrontText.textContent = '';
        cardFrontReading.textContent = '';
        cardFrontReading.classList.remove('visible');
        cardBackTitle.textContent = '';
        cardBackReading.textContent = '';
        cardBackPos.textContent = '';
        formMasu.textContent = '';
        formTe.textContent = '';
        formNai.textContent = '';
        formTa.textContent = '';
        cardBackNotes.textContent = '';
        answerHints.classList.remove('visible');

        if (!card.classList.contains('is-flipped')) {
            loadNextCardData();
        } else {
            card.classList.remove('is-flipped');
        }
    }

    // --- Feedback Flash ---
    function showFeedback(isCorrect) {
        feedbackFlash.classList.remove('correct', 'incorrect');
        void feedbackFlash.offsetWidth; // Force reflow
        feedbackFlash.classList.add(isCorrect ? 'correct' : 'incorrect');

        setTimeout(() => {
            feedbackFlash.classList.remove('correct', 'incorrect');
        }, 150);
    }

    // --- Answer Handling ---
    function handleAnswer(isCorrect) {
        if (!currentCard || isLoading) return;

        showFeedback(isCorrect);

        const key = currentCard.Kanji || currentCard.Japanese;
        if (key && stats[key]) {
            if (isCorrect) {
                stats[key].correct++;
                sessionStats.correct++;
            } else {
                stats[key].incorrect++;
                sessionStats.incorrect++;
            }
        }

        saveStats();
        updateStreak();

        // Auto-advance after brief delay
        setTimeout(() => {
            showNextCard();
        }, 200);
    }

    // --- Tap Handler ---
    function handleTap() {
        if (isLoading) return;

        if (isFlipped) {
            showNextCard();
        } else {
            // In hint mode (ja-en only), first tap reveals reading
            if (displayMode === 'hint' && mode === 'ja-en' && !hintRevealed) {
                hintRevealed = true;
                cardFrontReading.classList.add('visible');
                return;
            }
            // Otherwise flip the card
            isFlipped = true;
            card.classList.add('is-flipped');
            answerHints.classList.add('visible');
        }
    }

    // --- Settings Modal ---
    function openSettings() {
        settingsModal.classList.add('visible');
        settingsHint.classList.remove('visible');
    }

    function closeSettingsModal() {
        settingsModal.classList.remove('visible');
    }

    // --- Pointer Events (work for both mouse and touch) ---
    let pointerStartX = 0;
    let pointerStartY = 0;
    let activePointerId = null;

    function handlePointerDown(e) {
        if (settingsModal.classList.contains('visible')) return;
        if (e.target.closest('#settings-btn')) return;

        activePointerId = e.pointerId;
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
        hasMoved = false;

        // Long press detection
        longPressTimer = setTimeout(() => {
            if (!hasMoved) {
                openSettings();
            }
        }, LONG_PRESS_DURATION);

        // Show hint after brief delay
        hintTimer = setTimeout(() => {
            if (!hasMoved) {
                settingsHint.classList.add('visible');
            }
        }, 400);
    }

    function handlePointerMove(e) {
        if (e.pointerId !== activePointerId) return;
        if (settingsModal.classList.contains('visible')) return;

        const diffX = e.clientX - pointerStartX;
        const diffY = e.clientY - pointerStartY;

        // Cancel long press if moving
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
            hasMoved = true;
            clearTimeout(longPressTimer);
            clearTimeout(hintTimer);
            settingsHint.classList.remove('visible');
        }

        // Visual tilt feedback for horizontal swipe
        if (Math.abs(diffX) > 20 && Math.abs(diffX) > Math.abs(diffY)) {
            card.classList.remove('tilting-left', 'tilting-right');
            if (diffX > 0) {
                card.classList.add('tilting-right');
            } else {
                card.classList.add('tilting-left');
            }
        }
    }

    function handlePointerUp(e) {
        if (e.pointerId !== activePointerId) return;

        clearTimeout(longPressTimer);
        clearTimeout(hintTimer);
        settingsHint.classList.remove('visible');

        if (settingsModal.classList.contains('visible')) {
            activePointerId = null;
            return;
        }

        const diffX = e.clientX - pointerStartX;

        // Reset tilt
        card.classList.remove('tilting-left', 'tilting-right');

        // Check for swipe
        if (Math.abs(diffX) > SWIPE_THRESHOLD && hasMoved) {
            if (isFlipped) {
                handleAnswer(diffX > 0); // Right = correct, Left = incorrect
            }
            activePointerId = null;
            return;
        }

        // Not a swipe - treat as tap
        if (!hasMoved) {
            handleTap();
        }

        activePointerId = null;
    }

    function handlePointerCancel(e) {
        if (e.pointerId !== activePointerId) return;
        clearTimeout(longPressTimer);
        clearTimeout(hintTimer);
        settingsHint.classList.remove('visible');
        card.classList.remove('tilting-left', 'tilting-right');
        activePointerId = null;
    }

    // --- Event Listeners ---

    // Pointer events on card (works for mouse and touch)
    card.addEventListener('pointerdown', handlePointerDown);
    card.addEventListener('pointermove', handlePointerMove);
    card.addEventListener('pointerup', handlePointerUp);
    card.addEventListener('pointercancel', handlePointerCancel);
    card.addEventListener('pointerleave', handlePointerCancel);

    // Transition end for card flip
    cardInner.addEventListener('transitionend', () => {
        if (isLoading && !isFlipped) {
            loadNextCardData();
        }
    });

    // Settings button (for desktop)
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSettings();
        });
    }

    // Answer buttons
    btnCorrect.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isFlipped) handleAnswer(true);
    });
    btnIncorrect.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isFlipped) handleAnswer(false);
    });

    // Settings modal
    closeSettings.addEventListener('click', closeSettingsModal);

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });

    // Theme buttons
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            setTheme(btn.dataset.theme);
        });
    });

    // Display mode buttons
    displayModeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            displayMode = btn.dataset.display;
            updateDisplayModeButtons();
            saveSettings();
            renderCurrentCard();
        });
    });

    // Mode toggle
    modeToggle.addEventListener('change', () => {
        mode = modeToggle.checked ? 'en-ja' : 'ja-en';
        saveSettings();
        renderCurrentCard();
    });

    // Distribution toggle
    distToggle.addEventListener('change', () => {
        useWeightedDist = distToggle.checked;
        saveSettings();
    });

    // Keyboard support
    document.addEventListener('keydown', (e) => {
        if (settingsModal.classList.contains('visible')) {
            if (e.key === 'Escape') closeSettingsModal();
            return;
        }

        switch (e.key) {
            case ' ':
            case 'Enter':
                e.preventDefault();
                handleTap();
                break;
            case 'ArrowRight':
                if (isFlipped) handleAnswer(true);
                break;
            case 'ArrowLeft':
                if (isFlipped) handleAnswer(false);
                break;
            case 's':
            case 'S':
                openSettings();
                break;
        }
    });


    // --- Initialization ---
    async function initializeApp() {
        initTheme();
        await loadVocabData();
        loadStats();
        loadSettings();
        loadNextCardData();
    }

    initializeApp();
});
