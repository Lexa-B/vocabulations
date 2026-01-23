document.addEventListener('DOMContentLoaded', () => {
    // --- Config ---
    const TIERS = {
        mastered:   { label: 'Mastered',    color: '#4caf50', minAccuracy: 0.9, minAttempts: 5 },
        confident:  { label: 'Confident',   color: '#8bc34a', minAccuracy: 0.7, minAttempts: 3 },
        learning:   { label: 'Learning',    color: '#ff9800', minAccuracy: 0.5, minAttempts: 1 },
        struggling: { label: 'Struggling',  color: '#f44336', minAccuracy: 0,   minAttempts: 1 },
        unseen:     { label: 'Not Started', color: '#9e9e9e', minAccuracy: 0,   minAttempts: 0 }
    };

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
            if (values.length < 2 || !values[0] || !values[1]) continue;
            const row = {};
            headers.forEach((header, index) => { row[header] = values[index] ? values[index].trim() : ''; });
            data.push(row);
        }
        return data;
    }

    // --- Tier Calculation ---
    function getTier(correct, incorrect) {
        const total = correct + incorrect;
        if (total === 0) return 'unseen';
        const accuracy = correct / total;
        if (accuracy >= TIERS.mastered.minAccuracy && total >= TIERS.mastered.minAttempts) return 'mastered';
        if (accuracy >= TIERS.confident.minAccuracy && total >= TIERS.confident.minAttempts) return 'confident';
        if (accuracy >= TIERS.learning.minAccuracy) return 'learning';
        return 'struggling';
    }

    // --- Streak Calculation ---
    function getStreak() {
        const streakData = JSON.parse(localStorage.getItem('streakData') || '{}');
        const today = new Date().toISOString().split('T')[0];

        if (!streakData.lastPracticeDate) return 0;

        const lastDate = new Date(streakData.lastPracticeDate);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

        if (diffDays > 1) return 0; // Streak broken
        return streakData.currentStreak || 0;
    }

    // --- Main Data Processing ---
    async function initializeStats() {
        const stats = JSON.parse(localStorage.getItem('vocabStats') || '{}');
        const sessionHistory = JSON.parse(localStorage.getItem('sessionHistory') || '[]');

        let vocabData = [];
        try {
            const response = await fetch('vocab.csv');
            const csvText = await response.text();
            vocabData = parseCSV(csvText);
        } catch (error) {
            console.error("Could not load vocab.csv:", error);
            return;
        }

        // Process all words with their stats
        const processedWords = vocabData.map(item => {
            const kanji = item.Kanji || item.Japanese || '';
            const reading = item['Reading (Kana)'] || '';
            const wordStats = stats[kanji] || { correct: 0, incorrect: 0 };
            const total = wordStats.correct + wordStats.incorrect;
            const accuracy = total > 0 ? wordStats.correct / total : 0;
            return {
                japanese: kanji,
                reading: reading,
                english: item.English,
                correct: wordStats.correct,
                incorrect: wordStats.incorrect,
                attempts: total,
                accuracy: accuracy,
                tier: getTier(wordStats.correct, wordStats.incorrect)
            };
        });

        // Calculate summary stats
        const totalCorrect = processedWords.reduce((sum, w) => sum + w.correct, 0);
        const totalIncorrect = processedWords.reduce((sum, w) => sum + w.incorrect, 0);
        const totalReviews = totalCorrect + totalIncorrect;
        const overallAccuracy = totalReviews > 0 ? (totalCorrect / totalReviews * 100).toFixed(0) : 0;
        const wordsPracticed = processedWords.filter(w => w.attempts > 0).length;
        const streak = getStreak();

        // Update summary cards
        document.getElementById('overall-accuracy').textContent = overallAccuracy + '%';
        document.getElementById('words-practiced').textContent = `${wordsPracticed}/${processedWords.length}`;
        document.getElementById('total-reviews').textContent = totalReviews.toLocaleString();
        document.getElementById('streak').textContent = streak > 0 ? streak + ' 🔥' : '0';

        // Calculate tier distribution
        const tierCounts = { mastered: 0, confident: 0, learning: 0, struggling: 0, unseen: 0 };
        processedWords.forEach(w => tierCounts[w.tier]++);

        renderTierChart(tierCounts);
        renderProblemTable(processedWords);
        renderProgressChart(sessionHistory);
        initializeFullTable(processedWords);

        // Reset stats button
        document.getElementById('reset-stats-btn').addEventListener('click', () => {
            if (confirm("Are you sure you want to reset all your stats? This cannot be undone.")) {
                localStorage.removeItem('vocabStats');
                localStorage.removeItem('sessionHistory');
                localStorage.removeItem('streakData');
                location.reload();
            }
        });
    }

    // --- Tier Donut Chart ---
    function renderTierChart(tierCounts) {
        const ctx = document.getElementById('tier-chart').getContext('2d');
        const labels = Object.keys(TIERS).map(k => TIERS[k].label);
        const data = Object.keys(TIERS).map(k => tierCounts[k]);
        const colors = Object.keys(TIERS).map(k => TIERS[k].color);

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.label}: ${ctx.raw} words`
                        }
                    }
                },
                cutout: '60%'
            }
        });

        // Render custom legend
        const legendEl = document.getElementById('tier-legend');
        legendEl.innerHTML = Object.keys(TIERS).map(k => `
            <div class="tier-legend-item">
                <span class="tier-dot" style="background: ${TIERS[k].color}"></span>
                <span>${TIERS[k].label}: ${tierCounts[k]}</span>
            </div>
        `).join('');
    }

    // --- Problem Words Table ---
    function renderProblemTable(words) {
        const tbody = document.querySelector('#problem-table tbody');

        // Get words that need work: practiced but struggling, sorted by accuracy
        const problemWords = words
            .filter(w => w.attempts >= 2 && w.accuracy < 0.7)
            .sort((a, b) => a.accuracy - b.accuracy)
            .slice(0, 10);

        if (problemWords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999; padding: 20px;">No problem words yet - keep practicing!</td></tr>';
            return;
        }

        tbody.innerHTML = problemWords.map(w => `
            <tr>
                <td>${w.japanese}</td>
                <td>${w.english}</td>
                <td>${renderAccuracyBar(w.accuracy)}</td>
                <td>${w.attempts}</td>
            </tr>
        `).join('');
    }

    function renderAccuracyBar(accuracy) {
        const pct = (accuracy * 100).toFixed(0);
        const colorClass = accuracy < 0.5 ? 'accuracy-low' : accuracy < 0.7 ? 'accuracy-med' : 'accuracy-high';
        return `
            <div class="accuracy-bar">
                <div class="accuracy-bar-fill ${colorClass}" style="width: ${pct}%"></div>
            </div>
            ${pct}%
        `;
    }

    // --- Progress Over Time Chart ---
    function renderProgressChart(sessionHistory) {
        const ctx = document.getElementById('progress-chart').getContext('2d');
        const noDataMsg = document.getElementById('no-progress-data');

        if (sessionHistory.length < 2) {
            ctx.canvas.style.display = 'none';
            noDataMsg.style.display = 'block';
            return;
        }

        // Aggregate by date
        const byDate = {};
        sessionHistory.forEach(s => {
            const date = s.date.split('T')[0];
            if (!byDate[date]) byDate[date] = { correct: 0, incorrect: 0 };
            byDate[date].correct += s.correct;
            byDate[date].incorrect += s.incorrect;
        });

        const dates = Object.keys(byDate).sort().slice(-30); // Last 30 days
        const accuracies = dates.map(d => {
            const total = byDate[d].correct + byDate[d].incorrect;
            return total > 0 ? (byDate[d].correct / total * 100).toFixed(1) : 0;
        });

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(d => {
                    const date = new Date(d);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: [{
                    label: 'Daily Accuracy %',
                    data: accuracies,
                    borderColor: '#2196F3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });
    }

    // --- Full Word List ---
    let allWords = [];

    function initializeFullTable(words) {
        allWords = words;

        document.getElementById('tier-filter').addEventListener('change', renderFullTable);
        document.getElementById('sort-by').addEventListener('change', renderFullTable);
        document.getElementById('search-input').addEventListener('input', debounce(renderFullTable, 200));

        renderFullTable();
    }

    function renderFullTable() {
        const tierFilter = document.getElementById('tier-filter').value;
        const sortBy = document.getElementById('sort-by').value;
        const search = document.getElementById('search-input').value.toLowerCase();

        let filtered = allWords.filter(w => {
            if (tierFilter !== 'all' && w.tier !== tierFilter) return false;
            if (search && !w.japanese.toLowerCase().includes(search) && !w.english.toLowerCase().includes(search)) return false;
            return true;
        });

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'accuracy-asc': return a.accuracy - b.accuracy;
                case 'accuracy-desc': return b.accuracy - a.accuracy;
                case 'attempts-desc': return b.attempts - a.attempts;
                case 'attempts-asc': return a.attempts - b.attempts;
                case 'japanese': return a.japanese.localeCompare(b.japanese, 'ja');
                default: return 0;
            }
        });

        document.getElementById('word-count').textContent = `Showing ${filtered.length} of ${allWords.length} words`;

        const tbody = document.querySelector('#full-table tbody');
        tbody.innerHTML = filtered.slice(0, 100).map(w => `
            <tr>
                <td>${w.japanese}</td>
                <td>${w.english}</td>
                <td>${w.attempts > 0 ? renderAccuracyBar(w.accuracy) : '-'}</td>
                <td>${w.attempts}</td>
                <td><span style="color: ${TIERS[w.tier].color}">${TIERS[w.tier].label}</span></td>
            </tr>
        `).join('');

        if (filtered.length > 100) {
            tbody.innerHTML += '<tr><td colspan="5" style="text-align: center; color: #999; padding: 10px;">Showing first 100 results. Use search to narrow down.</td></tr>';
        }
    }

    function debounce(fn, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // --- Initialize ---
    initializeStats();
});
