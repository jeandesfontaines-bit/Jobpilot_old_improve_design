# Bibliothèque CV : état réel

Le routeur src/server/cvVaultRouter.ts fournit une liste persistante, un import de vrais PDF et un accès aperçu/téléchargement. Il ne génère pas de CV fictifs.

Il n’est PAS encore monté dans server.ts. Aucun écran n’est encore branché. Cette livraison seule ne change donc pas le comportement de JobPilot.

Montage requis après express.json et avant les routes génériques / le fallback Vite : app.use('/api/cvs', createCvVaultRouter(DATA_DIR)). Importer createCvVaultRouter depuis './src/server/cvVaultRouter'. Conserver les protections d’accès de l’application hôte. Ne pas exposer ce routeur contenant des données personnelles sur Internet sans authentification.

Routes : GET /api/cvs ; POST /api/cvs avec name et base64_content ; GET /api/cvs/:id/file ; GET /api/cvs/:id/file?download=1.

Suite indispensable : écran Mes CV avec sélection et aperçu PDF réel ; migration des CV existants sans suppression ; sélection du CV de base persistée ; raccordement à l’agent qui doit joindre le fichier choisi, non un chemin codé en dur ; variantes liées aux offres ; tests d’intégration et compilation.

Aucun test exécuté pour cette livraison.
