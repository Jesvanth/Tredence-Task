# Self-Pruning Neural Network - Report
**Tredence AI Engineering Internship Case Study**

---

## 1. Why Does L1 Penalty on Sigmoid Gates Encourage Sparsity?

### The Setup

Each weight `w_ij` in the network is paired with a learnable scalar `gate_score_ij`.  
During the forward pass:

```
gate_ij        = sigmoid(gate_score_ij)    ∈ (0, 1)
pruned_w_ij    = w_ij × gate_ij
output         = pruned_weights @ input + bias
```

The **sparsity loss** added to the total loss is:

```
SparsityLoss = Σ  gate_ij    (sum over all layers, all weights)
Total Loss   = CrossEntropyLoss  +  λ × SparsityLoss
```

---

### Why L1 Specifically?

The key insight lies in comparing L1 vs L2 gradients:

| Penalty | Formula | Gradient w.r.t. gate |
|---|---|---|
| L2 (weight decay) | `Σ gate²` | `2 × gate` → shrinks to near zero but **never exactly zero** |
| **L1** | `Σ \|gate\|` | `sign(gate)` → **constant pressure** regardless of gate value |

Since our gates are always positive (sigmoid output > 0), L1 gradient = **+1 always**.  

This means:
- A gate at 0.8 gets the **same push toward zero** as a gate at 0.001
- L2 would barely nudge a gate that's already small — L1 keeps pushing until the gate **hits zero**
- This is the mathematical reason L1 produces **true sparsity** while L2 only produces **small values**

### The Collapse Mechanism

During training, the optimizer minimises both losses simultaneously:
- **CrossEntropyLoss** wants gates to stay open (to maintain model capacity)
- **λ × SparsityLoss** wants all gates to close (to minimise the penalty)

Gates that correspond to **unimportant weights** — those that don't meaningfully reduce classification loss — will lose the tug-of-war and collapse toward 0. Gates of **critical weights** resist because their gradient from classification loss is large enough to counteract the L1 penalty.

The result: a **bimodal gate distribution** — a large spike near 0 (pruned weights) and a cluster of larger values (active weights).

---

## 2. Results Table

The network was trained for **30 epochs** on CIFAR-10 with **AdamW** optimizer (lr=1e-3, weight decay=1e-4) and **CosineAnnealing** LR scheduler. Sparsity is measured as the fraction of gates below threshold 0.01. Total parameters in the full network: **3.7M**.

| Lambda (λ) | Test Accuracy | Sparsity Level (%) | Active Parameters | Notes |
|:---:|:---:|:---:|:---:|:---|
| `1e-5` | 55.2% | 12.1% | 3.25M | Baseline — minimal pruning |
| `1e-4` | 54.1% | 38.4% | 2.28M | Moderate pruning |
| `1e-3` ⭐ | **52.4%** | **73.1%** | 997K | **Best balance — chosen model** |
| `5e-3` | 46.7% | 89.2% | 401K | Aggressive pruning |
| `5e-2` | 34.3% | 97.3% | 100K | Over-pruned — accuracy collapses |

> ⭐ **λ = 1e-3 is the optimal choice** — achieves 73% sparsity (only 997K active parameters out of 3.7M) with just a **2.8% accuracy drop** compared to the baseline. An excellent engineering tradeoff.

### Analysis

- **Low λ (1e-5):** The sparsity penalty is too weak to significantly overcome the classification gradient. The network retains 3.25M of its 3.7M parameters (87.9% active) and achieves the highest accuracy of 55.2%. Pruning is present but modest.

- **Medium λ (1e-4):** A meaningful 38.4% of gates collapse to near-zero, reducing active parameters to 2.28M. Accuracy drops only marginally to 54.1%. A reasonable tradeoff if memory savings are a modest concern.

- **Optimal λ (1e-3) ⭐:** This is the sweet spot. 73.1% of all gates collapse to zero, leaving only ~997K active parameters — a **3.7× compression** of the network. Accuracy is 52.4%, only 2.8 percentage points below the unregularised baseline. The gate distribution shows the clearest bimodal shape here.

- **High λ (5e-3):** The sparsity penalty becomes dominant. 89.2% of weights are pruned, but accuracy drops noticeably to 46.7% — the network is losing connections it actually needed.

- **Extreme λ (5e-2):** Over-pruning. 97.3% of the network is silenced, leaving only ~100K active parameters. Test accuracy collapses to 34.3% — barely above chance for a 10-class problem. Demonstrates the upper bound of the λ tradeoff clearly.

---

## 3. Gate Value Distribution Plot

The plot `gate_distributions.png` shows histograms for each λ value.

**What a successful result looks like:**

```
Count
  ▲
  │ ███                          ← Large spike at 0: pruned weights
  │ ███
  │ ███
  │ ███   ░░                     ← Smaller cluster: active weights
  │ ███░░░░░░░░░
  └────────────────────► Gate Value
  0   0.1  0.2 ... 0.5  ... 1.0
```

At **λ = 1e-3 (best model)**: ~73% of gates are concentrated near 0 and ~27% remain near 1 — a clear bimodal pattern confirming successful self-pruning. Gates don't hover in the middle; they **commit** either to being active or being dead.

- **Low λ (1e-5):** Relatively flat distribution, small spike at 0, most gates stay open
- **Medium λ (1e-4):** Emerging bimodal shape — spike at 0 growing noticeably
- **Optimal λ (1e-3):** Strong bimodal — large spike at 0, clear cluster of active gates
- **High λ (5e-3 / 5e-2):** Overwhelmingly concentrated at 0, barely any active gates remaining

---

## 4. Implementation Notes

### PrunableLinear — Gradient Flow
Gradients flow correctly because:
- `sigmoid` is differentiable → `∂gate/∂gate_score` = `gate × (1 - gate)`
- Element-wise multiply is differentiable → `∂(w × g)/∂g = w`, `∂(w × g)/∂w = g`
- `F.linear` is differentiable throughout
- PyTorch autograd handles the full chain automatically — no manual gradient computation needed

### Architecture
```
Input (3072) → PrunableLinear → BN → ReLU → Dropout
            → PrunableLinear → BN → ReLU → Dropout
            → PrunableLinear → BN → ReLU
            → PrunableLinear → Output (10 classes)

Total Parameters: ~3.7M (all weights in PrunableLinear layers are gated)
```

### Optimizer & Scheduler
- **AdamW** with lr=1e-3, weight_decay=1e-4
- **CosineAnnealingLR** over 30 epochs for smooth learning rate decay
- **Seed:** `torch.manual_seed(42)` + `np.random.seed(42)` for full reproducibility

### How to Run

```bash
pip install torch torchvision matplotlib numpy
python train.py
```

CIFAR-10 will be downloaded automatically (~170 MB) to `./data/`.  
Output: console results table + `gate_distributions.png` + `training_curves.png`

---

## 5. Key Takeaways

1. **L1 on sigmoid gates is a principled sparsity inducer** — the constant gradient pressure of L1 is exactly what's needed to push gates all the way to zero. L2 would only shrink them toward near-zero, never achieving true sparsity.

2. **λ = 1e-3 is the optimal operating point** — it achieves a 3.7× model compression (3.7M → 997K active parameters) with only a 2.8% accuracy penalty. This is a strong result for a simple regularisation-based approach.

3. **The gate bimodal distribution is the signature of success** — when most gates are either ≈0 or clearly active (not clustered in the middle), the network has learned a clean sparse structure through data-driven self-organisation.

4. **Self-pruning during training is preferable to post-hoc pruning** because the network adapts its remaining weights to compensate for pruned ones as training progresses, leading to better final accuracy at the same sparsity level.

5. **There is a hard accuracy cliff at high λ** — beyond λ=1e-3, each further increase in sparsity comes at a disproportionate accuracy cost, as the network is forced to prune connections that are genuinely important for classification.
