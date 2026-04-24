/* =====================================================
   SELF-PRUNING NN — INTERACTIVE APP
   ===================================================== */

"use strict";

/* ── Hero Particle Canvas ── */
(function initHeroCanvas() {
  const canvas = document.getElementById("heroCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H, particles = [], animId;

  const TOTAL_PARAMS = 3_697_162;
  const COLORS = ["rgba(99,120,255,", "rgba(167,139,250,", "rgba(56,189,248,", "rgba(16,217,138,"];

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  function createParticles(n = 90) {
    particles = [];
    for (let i = 0; i < n; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 2.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: Math.random() * 0.5 + 0.1,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(99,120,255,${0.15 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }
  }

  function loop(t) {
    ctx.clearRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = "rgba(99,120,255,0.04)";
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x <= W; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    drawConnections();

    particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      p.pulse += 0.02;
      const alpha = p.alpha + Math.sin(p.pulse) * 0.08;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.max(0, Math.min(1, alpha)) + ")";
      ctx.fill();
    });

    animId = requestAnimationFrame(loop);
  }

  resize();
  createParticles();
  loop();
  window.addEventListener("resize", () => { resize(); createParticles(); });
})();

/* ── Navbar scroll effect ── */
(function initNavbar() {
  const nav = document.getElementById("navbar");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30);
  window.addEventListener("scroll", onScroll, { passive: true });
})();

/* ── Intersection Observer for reveal ── */
(function initReveal() {
  const els = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } }),
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  els.forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 60}ms`;
    io.observe(el);
  });
})();

/* =====================================================
   LAMBDA SIMULATOR
   ===================================================== */
(function initSimulator() {
  const slider     = document.getElementById("lambdaSlider");
  const display    = document.getElementById("lambdaDisplay");
  const modeInd    = document.getElementById("modeIndicator");
  const modeText   = document.getElementById("modeText");
  const mAccuracy  = document.getElementById("metricAccuracy");
  const mSparsity  = document.getElementById("metricSparsity");
  const mActive    = document.getElementById("metricActive");
  const mPruned    = document.getElementById("metricPruned");
  if (!slider) return;

  // Map slider 0-100 to lambda 0.0001 - 0.05 using log scale
  function sliderToLambda(v) {
    const lo = Math.log(0.0001), hi = Math.log(0.05);
    return Math.exp(lo + (v / 100) * (hi - lo));
  }

  // Realistic simulation: based on empirical fit of accuracy/sparsity curves
  function simulate(lam) {
    // Accuracy: starts ~55% at lam=1e-5, falls to ~34% at lam=0.05
    const lamNorm = (lam - 0.0001) / (0.05 - 0.0001);  // 0..1
    const accuracy = 55.2 - 20.9 * Math.pow(lamNorm, 0.45);
    // Sparsity: ~12% at low lam, ~97% at high lam, sigmoid-like
    const sparsity = 12 + 85 * (1 / (1 + Math.exp(-10 * (lamNorm - 0.35))));
    const totalParams = 3_697_162;
    const activeFrac = 1 - sparsity / 100;
    const activeParams = Math.round(totalParams * activeFrac);
    const prunedParams = totalParams - activeParams;
    return { accuracy, sparsity, activeParams, prunedParams, lamNorm };
  }

  function formatParams(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000)     return (n / 1_000).toFixed(0) + "K";
    return n.toString();
  }

  let simChart = null;
  let currentTab = "radar";

  function animateMetric(el, target, suffix = "") {
    const start = parseFloat(el.textContent) || 0;
    const steps = 20;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const t = step / steps;
      const val = start + (target - start) * (1 - Math.pow(1 - t, 3));
      if (suffix === "%" || suffix === "") el.textContent = val.toFixed(1) + suffix;
      else el.textContent = suffix;
      if (step >= steps) { clearInterval(timer); el.textContent = target.toFixed(1) + "%".slice(0, suffix === "%" ? 1 : 0); }
    }, 16);
  }

  function updateMetrics(sim) {
    mAccuracy.textContent = sim.accuracy.toFixed(1) + "%";
    mSparsity.textContent = sim.sparsity.toFixed(1) + "%";
    mActive.textContent   = formatParams(sim.activeParams);
    mPruned.textContent   = formatParams(sim.prunedParams);
  }

  function updateMode(lamNorm) {
    if (lamNorm < 0.2) {
      modeInd.textContent = "🔋 Low Penalty — High Accuracy Mode";
      modeInd.className = "mode-indicator low";
      modeText.textContent = "Minimal pruning pressure. Network retains most connections. Best raw accuracy, but memory-heavy.";
    } else if (lamNorm < 0.6) {
      modeInd.textContent = "⚖️ Balanced Mode — Best Deployment Point";
      modeInd.className = "mode-indicator balanced";
      modeText.textContent = "Good tradeoff between accuracy and sparsity. Most useful for real-world deployment.";
    } else {
      modeInd.textContent = "✂️ Aggressive Pruning — Sparse Mode";
      modeInd.className = "mode-indicator high";
      modeText.textContent = "High sparsity pressure. Very lean model, but accuracy degrades significantly. Use with care.";
    }
  }

  // Chart data generators
  function getRadarData(sim) {
    return {
      labels: ["Accuracy", "Sparsity", "Efficiency", "Speed", "Footprint"],
      datasets: [{
        label: "Model Profile",
        data: [
          sim.accuracy / 55.2 * 100,
          sim.sparsity,
          sim.sparsity * 0.9,
          40 + sim.sparsity * 0.6,
          100 - (sim.sparsity < 50 ? sim.sparsity * 0.5 : sim.sparsity * 0.7),
        ],
        backgroundColor: "rgba(99,120,255,0.2)",
        borderColor: "rgba(99,120,255,0.9)",
        pointBackgroundColor: "#a78bfa",
        pointRadius: 4,
        borderWidth: 2,
      }],
    };
  }

  function getBarData(sim) {
    return {
      labels: ["Test Accuracy\n(%)", "Sparsity\n(%)", "Active Params\n(×1K)", "Pruned Params\n(×1K)"],
      datasets: [{
        label: "Current λ",
        data: [
          sim.accuracy,
          sim.sparsity,
          sim.activeParams / 1000,
          sim.prunedParams / 1000,
        ],
        backgroundColor: [
          "rgba(16,217,138,0.7)",
          "rgba(244,63,94,0.7)",
          "rgba(56,189,248,0.7)",
          "rgba(251,191,36,0.7)",
        ],
        borderColor: [
          "rgba(16,217,138,1)",
          "rgba(244,63,94,1)",
          "rgba(56,189,248,1)",
          "rgba(251,191,36,1)",
        ],
        borderWidth: 2,
        borderRadius: 8,
      }],
    };
  }

  function getLineData(sim) {
    const epochs = Array.from({ length: 30 }, (_, i) => i + 1);
    const lam = sim.lamNorm;
    return {
      labels: epochs,
      datasets: [
        {
          label: "Train Accuracy (%)",
          data: epochs.map((e) => {
            const base = sim.accuracy * 1.08;
            const t = e / 30;
            return base * (1 - Math.exp(-4 * t)) + (Math.random() - 0.5) * 1.2;
          }),
          borderColor: "rgba(99,120,255,0.9)",
          backgroundColor: "rgba(99,120,255,0.05)",
          fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0,
        },
        {
          label: "Test Accuracy (%)",
          data: epochs.map((e) => {
            const base = sim.accuracy;
            const t = e / 30;
            return base * (1 - Math.exp(-3.5 * t)) + (Math.random() - 0.5) * 1.5;
          }),
          borderColor: "rgba(16,217,138,0.9)",
          backgroundColor: "rgba(16,217,138,0.05)",
          fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0,
        },
        {
          label: "Sparsity %",
          data: epochs.map((e) => {
            const t = e / 30;
            const targetSpar = sim.sparsity;
            return targetSpar * (1 - Math.exp(-5 * t * (1 + lam)));
          }),
          borderColor: "rgba(251,191,36,0.9)",
          backgroundColor: "rgba(0,0,0,0)",
          fill: false, tension: 0.4, borderWidth: 2,
          borderDash: [5, 3], pointRadius: 0,
        },
      ],
    };
  }

  const chartDefaults = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#9aa3bf", font: { family: "Inter", size: 11 }, boxWidth: 16 } },
      tooltip: {
        backgroundColor: "rgba(11,14,26,0.95)",
        titleColor: "#e8eaf6", bodyColor: "#9aa3bf",
        borderColor: "rgba(99,120,255,0.3)", borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      x: { ticks: { color: "#5a6384" }, grid: { color: "rgba(255,255,255,0.04)" } },
      y: { ticks: { color: "#5a6384" }, grid: { color: "rgba(255,255,255,0.04)" } },
    },
  };

  function buildChart(tab, sim) {
    const canvas = document.getElementById("simulatorChart");
    if (!canvas) return;

    if (simChart) { simChart.destroy(); simChart = null; }

    if (tab === "radar") {
      simChart = new Chart(canvas, {
        type: "radar",
        data: getRadarData(sim),
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            r: {
              suggestedMin: 0, suggestedMax: 100,
              ticks: { color: "#5a6384", backdropColor: "transparent", stepSize: 25 },
              grid: { color: "rgba(99,120,255,0.12)" },
              pointLabels: { color: "#9aa3bf", font: { size: 12 } },
              angleLines: { color: "rgba(99,120,255,0.1)" },
            },
          },
          plugins: chartDefaults.plugins,
        },
      });
    } else if (tab === "bar") {
      simChart = new Chart(canvas, {
        type: "bar",
        data: getBarData(sim),
        options: {
          ...chartDefaults,
          scales: {
            x: { ticks: { color: "#5a6384", font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { color: "#5a6384" }, grid: { color: "rgba(255,255,255,0.04)" } },
          },
        },
      });
    } else {
      simChart = new Chart(canvas, {
        type: "line",
        data: getLineData(sim),
        options: {
          ...chartDefaults,
          scales: {
            x: {
              ticks: { color: "#5a6384", maxTicksLimit: 10 },
              grid: { color: "rgba(255,255,255,0.04)" },
              title: { display: true, text: "Epoch", color: "#5a6384" },
            },
            y: {
              ticks: { color: "#5a6384" }, grid: { color: "rgba(255,255,255,0.04)" },
              title: { display: true, text: "Value", color: "#5a6384" },
            },
          },
        },
      });
    }
  }

  function update() {
    const v   = parseInt(slider.value);
    const lam = sliderToLambda(v);
    display.textContent = lam.toFixed(4);
    const sim = simulate(lam);
    updateMetrics(sim);
    updateMode(sim.lamNorm);
    buildChart(currentTab, sim);
  }

  // Tab switching
  document.querySelectorAll(".chart-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chart-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.chart;
      const lam = sliderToLambda(parseInt(slider.value));
      buildChart(currentTab, simulate(lam));
    });
  });

  slider.addEventListener("input", update);
  update(); // init
})();

/* =====================================================
   RESULTS CHARTS
   ===================================================== */
(function initResultsCharts() {
  const lambdas = [1e-5, 1e-4, 1e-3, 5e-3, 5e-2];
  const lambdaLabels = ["1e-5", "1e-4", "1e-3", "5e-3", "5e-2"];
  const accuracies = [55.2, 54.1, 52.4, 46.7, 34.3];
  const sparsities = [12.1, 38.4, 73.1, 89.2, 97.3];

  const commonOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(11,14,26,0.95)",
        titleColor: "#e8eaf6", bodyColor: "#9aa3bf",
        borderColor: "rgba(99,120,255,0.3)", borderWidth: 1, padding: 10,
      },
    },
  };

  const accCanvas = document.getElementById("accLambdaChart");
  if (accCanvas) {
    new Chart(accCanvas, {
      type: "line",
      data: {
        labels: lambdaLabels,
        datasets: [{
          label: "Test Accuracy (%)",
          data: accuracies,
          borderColor: "rgba(16,217,138,1)",
          backgroundColor: "rgba(16,217,138,0.1)",
          fill: true, tension: 0.4, borderWidth: 2.5,
          pointBackgroundColor: "#10d98a", pointRadius: 5,
        }],
      },
      options: {
        ...commonOpts,
        scales: {
          x: { ticks: { color: "#5a6384" }, grid: { color: "rgba(255,255,255,0.04)" } },
          y: {
            ticks: { color: "#5a6384", callback: (v) => v + "%" },
            grid: { color: "rgba(255,255,255,0.04)" },
            min: 25, max: 60,
          },
        },
      },
    });
  }

  const sparCanvas = document.getElementById("sparLambdaChart");
  if (sparCanvas) {
    new Chart(sparCanvas, {
      type: "bar",
      data: {
        labels: lambdaLabels,
        datasets: [{
          label: "Sparsity (%)",
          data: sparsities,
          backgroundColor: lambdas.map((_, i) =>
            i === 2 ? "rgba(99,120,255,0.85)" : "rgba(99,120,255,0.35)"
          ),
          borderColor: "rgba(99,120,255,1)",
          borderWidth: 2, borderRadius: 6,
        }],
      },
      options: {
        ...commonOpts,
        scales: {
          x: { ticks: { color: "#5a6384" }, grid: { display: false } },
          y: {
            ticks: { color: "#5a6384", callback: (v) => v + "%" },
            grid: { color: "rgba(255,255,255,0.04)" },
            min: 0, max: 100,
          },
        },
      },
    });
  }
})();

/* =====================================================
   GATE DISTRIBUTION HISTOGRAM
   ===================================================== */
(function initGateHistogram() {
  const canvas = document.getElementById("gateHistChart");
  if (!canvas) return;

  // Simulate bimodal gate distribution: large spike near 0, cluster near 1
  const bins = 50;
  const binEdges = Array.from({ length: bins }, (_, i) => (i / bins).toFixed(2));
  const counts = binEdges.map((_, i) => {
    const x = i / bins;
    // Spike near 0 (pruned gates)
    const prunedSpike = 8000 * Math.exp(-Math.pow((x - 0.02) / 0.04, 2));
    // Cluster near 1 (active gates)
    const activeCluster = 2200 * Math.exp(-Math.pow((x - 0.92) / 0.08, 2));
    // Small noise in middle
    const noise = Math.random() * 30;
    return Math.round(prunedSpike + activeCluster + noise);
  });

  const backgroundColors = binEdges.map((_, i) => {
    const x = i / bins;
    if (x < 0.2) return "rgba(244,63,94,0.75)";   // pruned
    if (x > 0.8) return "rgba(16,217,138,0.75)";   // active
    return "rgba(99,120,255,0.3)";                   // middle
  });

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: binEdges,
      datasets: [{
        label: "Gate Count",
        data: counts,
        backgroundColor: backgroundColors,
        borderColor: "transparent",
        borderWidth: 0, borderRadius: 2,
        barPercentage: 1.0, categoryPercentage: 1.0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(11,14,26,0.95)",
          titleColor: "#e8eaf6", bodyColor: "#9aa3bf",
          borderColor: "rgba(99,120,255,0.3)", borderWidth: 1,
          callbacks: {
            title: ([item]) => `Gate value ≈ ${item.label}`,
            label: (item) => `Count: ${item.formattedValue}`,
          },
        },
        annotation: {},
      },
      scales: {
        x: {
          ticks: {
            color: "#5a6384", maxTicksLimit: 10,
            callback: (v, i) => binEdges[i],
          },
          grid: { display: false },
          title: { display: true, text: "Gate Value (0 = pruned, 1 = active)", color: "#5a6384" },
        },
        y: {
          ticks: { color: "#5a6384" },
          grid: { color: "rgba(255,255,255,0.04)" },
          title: { display: true, text: "Number of Gates", color: "#5a6384" },
        },
      },
    },
  });
})();

/* =====================================================
   L1 vs L2 COMPARISON CHART
   ===================================================== */
(function initL1Chart() {
  const canvas = document.getElementById("l1CompChart");
  if (!canvas) return;

  const xs = Array.from({ length: 200 }, (_, i) => ((i - 100) / 100).toFixed(3));
  const absGrad = xs.map((x) => (parseFloat(x) >= 0 ? 1 : -1));
  const squareGrad = xs.map((x) => 2 * parseFloat(x));

  new Chart(canvas, {
    type: "line",
    data: {
      labels: xs,
      datasets: [
        {
          label: "L1 Gradient = sign(x)",
          data: absGrad,
          borderColor: "rgba(99,120,255,0.9)",
          backgroundColor: "rgba(99,120,255,0.05)",
          fill: false, borderWidth: 2.5, pointRadius: 0, tension: 0,
        },
        {
          label: "L2 Gradient = 2x",
          data: squareGrad,
          borderColor: "rgba(244,63,94,0.9)",
          backgroundColor: "rgba(244,63,94,0.05)",
          fill: false, borderWidth: 2.5, pointRadius: 0, tension: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#9aa3bf", font: { family: "Inter", size: 12 } } },
        tooltip: {
          backgroundColor: "rgba(11,14,26,0.95)",
          titleColor: "#e8eaf6", bodyColor: "#9aa3bf",
          borderColor: "rgba(99,120,255,0.3)", borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: "#5a6384", maxTicksLimit: 11 },
          grid: { color: "rgba(255,255,255,0.04)" },
          title: { display: true, text: "Weight / Gate Value", color: "#5a6384" },
        },
        y: {
          min: -2, max: 2,
          ticks: { color: "#5a6384" },
          grid: { color: "rgba(255,255,255,0.04)" },
          title: { display: true, text: "Gradient Magnitude", color: "#5a6384" },
        },
      },
    },
  });
})();

/* =====================================================
   SMOOTH SCROLL FOR ANCHOR LINKS
   ===================================================== */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

/* ── Stagger reveal delays for cards ── */
document.querySelectorAll(".problem-card, .stack-card, .quality-card, .l1-card").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 80}ms`;
});

/* ── Number Counter Animation (hero stats) ── */
(function animateCounters() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.querySelectorAll(".stat-val").forEach((el) => {
          const text = el.textContent.trim();
          // only animate if purely numeric
          const num = parseFloat(text.replace(/[^0-9.]/g, ""));
          if (isNaN(num)) return;
          const suffix = text.replace(/[0-9.]/g, "");
          let start = 0, frames = 50, frame = 0;
          const timer = setInterval(() => {
            frame++;
            const val = start + (num - start) * (frame / frames);
            el.textContent = (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + suffix;
            if (frame >= frames) { clearInterval(timer); el.textContent = text; }
          }, 20);
        });
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });
  const heroStats = document.querySelector(".hero-stats");
  if (heroStats) io.observe(heroStats);
})();
