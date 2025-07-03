document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DOM Elements and State ---
    const card = document.getElementById('flashcard');
    const cardInner = card.querySelector('.card-inner'); // Get the inner element for the event listener
    const cardFrontText = document.getElementById('card-front-text');
    const cardBackTitle = document.getElementById('card-back-title');
    const cardBackDesc = document.getElementById('card-back-desc');
    const answerButtons = document.getElementById('answer-buttons');
    const modeToggle = document.getElementById('mode-toggle');
    const distToggle = document.getElementById('dist-toggle');
    const btnCorrect = document.getElementById('btn-correct');
    const btnIncorrect = document.getElementById('btn-incorrect');

    let vocabData = [];
    let stats = {};
    let currentCard = null;
    let isFlipped = false;
    let mode = 'ja-en';
    let useWeightedDist = false;
    let isLoading = true; // Prevent clicks while the card is transitioning

    // ... (The parseCSV function remains the same as the last version) ...
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


    // --- 2. Data Loading ---
    async function loadVocabData() {
        // ... (This function is the same as before) ...
        try {
            const response = await fetch('vocab.csv');
            const csvText = await response.text();
            vocabData = parseCSV(csvText);
        } catch (error) {
            console.error("Error loading or parsing vocab.csv:", error);
            cardFrontText.textContent = "Error: Could not load vocab.csv";
        }
    }

    function loadStats() {
        // ... (This function is the same as before) ...
        const statsJSON = localStorage.getItem('vocabStats');
        stats = statsJSON ? JSON.parse(statsJSON) : {};
        vocabData.forEach(word => {
            if (word.Japanese && !stats[word.Japanese]) {
                stats[word.Japanese] = { correct: 0, incorrect: 0 };
            }
        });
    }

    // ... (saveStats, getRandomCard, getWeightedRandomCard functions are the same as before) ...
    function saveStats() { localStorage.setItem('vocabStats', JSON.stringify(stats)); }
    function getRandomCard() { return vocabData[Math.floor(Math.random() * vocabData.length)]; }
    function getWeightedRandomCard() {
        const weightedPool = [];
        vocabData.forEach(word => {
            const wordStats = stats[word.Japanese];
            const weight = 10 + (wordStats.incorrect * 5);
            for (let i = 0; i < weight; i++) { weightedPool.push(word); }
        });
        return weightedPool[Math.floor(Math.random() * weightedPool.length)];
    }


    // --- 3. Card Logic (REWRITTEN) ---

    // This function ONLY populates the HTML elements with the new card's data.
    function loadNextCardData() {
        currentCard = useWeightedDist ? getWeightedRandomCard() : getRandomCard();
        // The card is now blank and facing forward. We unblank it with the new content.
        if (mode === 'ja-en') {
            cardFrontText.textContent = currentCard.Japanese;
            cardBackTitle.textContent = currentCard.English;
        } else {
            cardFrontText.textContent = currentCard.English;
            cardBackTitle.textContent = currentCard.Japanese;
        }
        cardBackDesc.textContent = currentCard.Description;
        isLoading = false; // The card is ready, allow clicks again.
    }

    // This function starts the process of showing the next card.
    function showNextCard() {
        isLoading = true; // Prevent any clicks while we transition.
        isFlipped = false;

        // **NEW**: Blank the card content *before* flipping back.
        cardFrontText.textContent = '';
        cardBackTitle.textContent = '';
        cardBackDesc.textContent = '';
        
        card.classList.remove('is-flipped');
        answerButtons.classList.remove('visible');
    }


    function handleCardInteraction() {
        if (isLoading) return; // Do nothing if a card is loading

        if (isFlipped) {
            // If the card is already flipped, this tap means "skip to next".
            showNextCard();
        } else {
            // If it's on the front, flip it to show the answer.
            isFlipped = true;
            card.classList.add('is-flipped');
            answerButtons.classList.add('visible');
        }
    }



    function handleAnswer(isCorrect) {
        if (!currentCard || isLoading) return;

        if (isCorrect) {
            stats[currentCard.Japanese].correct++;
        } else {
            stats[currentCard.Japanese].incorrect++;
        }
        saveStats();
        showNextCard();
    }


    card.addEventListener('click', handleCardInteraction);
    btnCorrect.addEventListener('click', () => handleAnswer(true));
    btnIncorrect.addEventListener('click', () => handleAnswer(false));
    modeToggle.addEventListener('change', () => {
        if (isLoading) return; // Prevent mode change during transition
        showNextCard();
    });
    distToggle.addEventListener('change', () => {
        useWeightedDist = distToggle.checked;
    });

    // The logic that waits for the animation to finish.
    cardInner.addEventListener('transitionend', () => {
        // We only want to load new data when a transition has been triggered by isLoading.
        if (isLoading && !isFlipped) {
            loadNextCardData();
        }
    });

    // --- 5. Initialization ---
    async function initializeApp() {
        await loadVocabData();
        loadStats();
        loadNextCardData(); // Load the very first card
    }
    initializeApp();
});
