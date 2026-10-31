import { Router } from 'express';
import {
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  getCartProcessingState,
  processCart,
  stopCartProcessing
} from '../services/cartEngine.ts';

const router = Router();

// 1. Consultation du panier
router.get('/api/cart', (_req, res) => {
  try {
    const items = getCart();
    res.json({
      success: true,
      items,
      count: items.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Ajout au panier (refus strict si déjà envoyée)
router.post('/api/cart/add', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'Identifiant d’offre manquant' });
    }

    const result = await addToCart(jobId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      cart: result.cart,
      count: result.cart.length,
      item: result.item
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Retrait d’une offre du panier
router.post('/api/cart/remove', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'Identifiant d’offre manquant' });
    }

    const result = await removeFromCart(jobId);
    res.json({
      success: true,
      cart: result.cart,
      count: result.cart.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Vider le panier
router.delete('/api/cart', async (_req, res) => {
  try {
    const result = await clearCart();
    res.json({
      success: true,
      cart: result.cart,
      count: 0
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. État en temps réel du traitement du panier
router.get('/api/cart/status', (_req, res) => {
  try {
    const state = getCartProcessingState();
    res.json({
      success: true,
      ...state
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Lancement du traitement du panier (postuler ou simuler, pour 1 ou plusieurs offres sélectionnées)
router.post('/api/cart/process', async (req, res) => {
  try {
    const { simulate, headless, pauseMs, wait, force_resubmit, confirm_real_send, jobIds } = req.body || {};

    if (wait === true) {
      // Mode synchrone / test : attend la fin complète
      const summary = await processCart({
        simulate: Boolean(simulate),
        headless: headless !== false,
        pauseMs: typeof pauseMs === 'number' ? pauseMs : 1500,
        force_resubmit: Boolean(force_resubmit),
        confirm_real_send: typeof confirm_real_send === 'boolean' ? confirm_real_send : undefined,
        jobIds: Array.isArray(jobIds) ? jobIds : undefined
      });
      return res.json(summary);
    }

    // Mode asynchrone pour l'UI : démarre en tâche de fond et renvoie 200
    processCart({
      simulate: Boolean(simulate),
      headless: headless !== false,
      pauseMs: typeof pauseMs === 'number' ? pauseMs : 1500,
      force_resubmit: Boolean(force_resubmit),
      confirm_real_send: typeof confirm_real_send === 'boolean' ? confirm_real_send : undefined,
      jobIds: Array.isArray(jobIds) ? jobIds : undefined
    }).catch((err) => {
      console.error('[CartEngine] Erreur de traitement du panier :', err);
    });

    res.json({
      success: true,
      message: simulate ? 'Simulation du panier démarrée' : 'Postulation du panier démarrée'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 7. Arrêt d'urgence ou interruption propre du traitement du panier
router.post('/api/cart/stop', (_req, res) => {
  try {
    const result = stopCartProcessing();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
