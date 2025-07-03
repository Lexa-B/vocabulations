document.addEventListener('DOMContentLoaded', () => {
    // ... (DOM elements and parseCSV function are the same as before)
    function parseCSV(text) { const lines = text.trim().split('\n'); const headers = lines[0].split(',').map(h => h.trim()); const data = []; for (let i = 1; i < lines.length; i++) { const line = lines[i]; let values = []; let currentField = ''; let inQuotes = false; for (let char of line) { if (char === '"' && !inQuotes) { inQuotes = true; continue; } if (char === '"' && inQuotes) { inQuotes = false; continue; } if (char === ',' && !inQuotes) { values.push(currentField); currentField = ''; continue; } currentField += char; } values.push(currentField); if (values.length < 2 || !values[0] || !values[1]) { continue; } const row = {}; headers.forEach((header, index) => { row[header] = values[index] ? values[index].trim() : ''; }); data.push(row); } return data; }

    async function prepareChartData() {
        const statsJSON = localStorage.getItem('vocabStats');
        const stats = statsJSON ? JSON.parse(statsJSON) : {};
        let vocabData = [];
        try {
            const response = await fetch('vocab.csv');
            const csvText = await response.text();
            vocabData = parseCSV(csvText);
        } catch (error) {
            console.error("ERROR: Could not fetch or parse vocab.csv.", error);
            alert("Fatal Error: Could not load vocab.csv. Check the console for details.");
            return;
        }

        const labels = vocabData.map(item => item.Japanese);
        const fullChartData = vocabData.map(vocabItem => {
            const wordStats = stats[vocabItem.Japanese] || { correct: 0, incorrect: 0 };
            const total = wordStats.correct + wordStats.incorrect;
            return {
                percentage: total === 0 ? 0 : (wordStats.correct / total) * 100,
                english: vocabItem.English,
                attempts: total
            };
        });

        if (fullChartData.length > 0) {
            renderChart(labels, fullChartData);
        } else {
            console.error("ERROR: No data available to render the chart.");
        }
    }

    function renderChart(labels, fullChartData) {
        const ctx = document.getElementById('stats-chart').getContext('2d');
        
        // **THE FIX**: Create a simple array of numbers for the 'data' property
        const percentages = fullChartData.map(d => d.percentage);

        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '% Correct',
                    data: percentages, // Use the simple array here
                    backgroundColor: 'rgba(33, 150, 243, 0.6)',
                    borderColor: 'rgba(33, 150, 243, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                plugins: {
                    tooltip: {
                        callbacks: {
                            // Use the index to look up the full data for the tooltip
                            title: (tooltipItems) => tooltipItems[0].label,
                            label: (tooltipItem) => {
                                const index = tooltipItem.dataIndex;
                                const itemData = fullChartData[index];
                                return [
                                    `English: ${itemData.english}`,
                                    `Correct: ${itemData.percentage.toFixed(1)}%`,
                                    `Attempts: ${itemData.attempts}`
                                ];
                            }
                        }
                    },
                    // ... (The rest of the options: scales, zoom, legend are the same)
                    zoom: { pan: { enabled: true, mode: 'x' }, zoom: { mode: 'x', pinch: { enabled: true }, wheel: { enabled: true, speed: 0.1, modifierKey: 'alt' }, limits: { x: { min: 'original', max: 'original', minRange: 5 } }, onZoomComplete: ({chart}) => { const scale = chart.scales.x; chart.options.scales.x.ticks.display = (scale.max - scale.min) < 30; chart.update('none'); } } },
                    legend: { display: false }
                }
            }
        });
    }

    // ... (Event listeners and initialization are the same)
    let myChart = null;
    const resetButton = document.getElementById('reset-zoom-btn');
    const resetStatsButton = document.getElementById('reset-stats-btn');
    resetButton.addEventListener('click', () => { if (myChart) { myChart.resetZoom(); myChart.options.scales.x.ticks.display = false; myChart.update('none'); } });
    resetStatsButton.addEventListener('click', () => { if (confirm("Are you sure you want to reset all your stats? This action cannot be undone.")) { localStorage.removeItem('vocabStats'); location.reload(); } });
    prepareChartData();
});