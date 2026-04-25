(() => {
  const palettes = {
    green: getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#0f9d58',
    greenDark: getComputedStyle(document.documentElement).getPropertyValue('--green-dark').trim() || '#0b7a44',
    greenDeep: getComputedStyle(document.documentElement).getPropertyValue('--green-deep').trim() || '#0c8449',
    yellow: getComputedStyle(document.documentElement).getPropertyValue('--yellow').trim() || '#f4b400',
    yellowDeep: getComputedStyle(document.documentElement).getPropertyValue('--yellow-deep').trim() || '#c88c00',
    gray: '#94a3b8',
    red: '#dc2626',
    purple: '#7c3aed',
    blue: '#2563eb'
  };

  async function fetchData(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }
    const payload = await response.json();
    return Array.isArray(payload.data) ? payload.data : [];
  }

  function createChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    return new Chart(canvas, config);
  }

  function toDatasetMap(rows, labelKey, seriesKey, valueKey) {
    const labels = [...new Set(rows.map((row) => row[labelKey]))];
    const series = [...new Set(rows.map((row) => row[seriesKey]))];

    return {
      labels,
      datasets: series.map((seriesName, index) => ({
        label: seriesName,
        data: labels.map((label) => {
          const found = rows.find((row) => row[labelKey] === label && row[seriesKey] === seriesName);
          return found ? Number(found[valueKey]) : 0;
        }),
        borderColor: [palettes.green, palettes.yellow, palettes.blue, palettes.red, palettes.purple, palettes.gray][index % 6],
        backgroundColor: [palettes.green, palettes.yellow, palettes.blue, palettes.red, palettes.purple, palettes.gray][index % 6],
        tension: 0.35,
        fill: false
      }))
    };
  }

  async function init() {
    try {
      const [wildlife, readings, ratings, alerts, visitors, infrastructure] = await Promise.all([
        fetchData('/api/analytics/wildlife-by-species'),
        fetchData('/api/analytics/readings-over-time'),
        fetchData('/api/analytics/feedback-ratings'),
        fetchData('/api/analytics/alerts-by-type'),
        fetchData('/api/analytics/visitor-trends'),
        fetchData('/api/analytics/infrastructure-status')
      ]);

      createChart('wildlifeBySpeciesChart', {
        type: 'bar',
        data: {
          labels: wildlife.map((item) => item.species_name),
          datasets: [{
            label: 'Sightings',
            data: wildlife.map((item) => Number(item.total_count)),
            backgroundColor: palettes.green
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      const readingsMap = toDatasetMap(readings, 'label', 'reading_type', 'average_value');
      createChart('readingsOverTimeChart', {
        type: 'line',
        data: readingsMap,
        options: { responsive: true, maintainAspectRatio: false }
      });

      const ratingTotals = [1, 2, 3, 4, 5].map((rating) => {
        const found = ratings.find((item) => Number(item.rating) === rating);
        return found ? Number(found.total) : 0;
      });
      createChart('feedbackRatingsChart', {
        type: 'doughnut',
        data: {
          labels: ['1', '2', '3', '4', '5'],
          datasets: [{
            data: ratingTotals,
            backgroundColor: [palettes.red, palettes.yellowDeep, palettes.yellow, palettes.greenDark, palettes.green]
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      const alertLabels = [...new Set(alerts.map((item) => item.type))];
      const severities = ['low', 'medium', 'high', 'critical'];
      createChart('alertsByTypeChart', {
        type: 'bar',
        data: {
          labels: alertLabels,
          datasets: severities.map((severity, index) => ({
            label: severity,
            data: alertLabels.map((type) => {
              const found = alerts.find((item) => item.type === type && item.severity === severity);
              return found ? Number(found.total) : 0;
            }),
            backgroundColor: [palettes.gray, palettes.yellow, palettes.yellowDeep, palettes.red][index]
          }))
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      const visitorMap = toDatasetMap(visitors, 'label', 'park_name', 'total_visitors');
      createChart('visitorTrendsChart', {
        type: 'line',
        data: visitorMap,
        options: { responsive: true, maintainAspectRatio: false }
      });

      createChart('infrastructureStatusChart', {
        type: 'bar',
        data: {
          labels: infrastructure.map((item) => item.status),
          datasets: [{
            label: 'Reports',
            data: infrastructure.map((item) => Number(item.total)),
            backgroundColor: [palettes.green, palettes.yellow, palettes.red]
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false
        }
      });
    } catch (error) {
      console.error(error);
    }
  }

  if (typeof Chart !== 'undefined') {
    init();
  }
})();
