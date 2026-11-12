# Affût GPS — carte de chasse hors ligne

Application web installable (PWA) : carte satellite ou topo, ta position GPS, points de chasse, traces et guidage vers un point. Les cartes se téléchargent d'avance et fonctionnent ensuite sans réseau cellulaire.

## 1. Mettre l'application en ligne (une seule fois, gratuit)

Le GPS d'un navigateur et le mode hors ligne exigent une adresse **https**. Le plus simple : GitHub Pages.

1. Crée un compte sur github.com.
2. **New repository** → nom `affut-gps` → Public → Create.
3. **Add file → Upload files** → glisse tous les fichiers du dossier (index.html, app.js, style.css, sw.js, manifest.webmanifest, icon-192.png, icon-512.png) → Commit.
4. **Settings → Pages** → Source : *Deploy from a branch*, branche `main`, dossier `/ (root)` → Save.
5. Après 1 à 2 minutes, l'adresse est `https://TON-NOM.github.io/affut-gps/`.

## 2. L'installer sur le téléphone

- **Android (Chrome)** : ouvre l'adresse → menu ⋮ → *Ajouter à l'écran d'accueil* / *Installer l'application*.
- **iPhone (Safari)** : ouvre l'adresse → bouton Partager → *Sur l'écran d'accueil*.
- Accepte la localisation (« Toujours autoriser » ou « Pendant l'utilisation »).

## 3. Avant de partir (avec du Wi-Fi)

1. Ouvre l'app installée, déplace la carte sur ton territoire de chasse.
2. Choisis le fond (bouton **Sat** / **Topo**). Télécharge les deux si tu veux les deux.
3. **Hors ligne** → choisis le zoom maximal → **Télécharger cette zone**. Répète pour couvrir tout le secteur.
4. Coupe les données mobiles et vérifie que la carte s'affiche encore.

Repères de taille : un secteur d'environ 10 × 10 km jusqu'au zoom 16 ≈ 1 500 à 2 500 tuiles (40 à 70 Mo). Le zoom 17 multiplie par quatre.

## Utilisation en forêt

- **Point** : marque ton véhicule, le camp, un mirador, une piste, une saline ou un abattage, à ta position ou au viseur du centre de la carte.
- **Trace** : enregistre ton trajet ; touche à nouveau pour terminer et nommer la trace.
- **Mes lieux** → **Guider** : flèche, distance et cap jusqu'au point (idéal pour revenir au véhicule à la noirceur).
- Bouton écran (côté droit) : garde l'écran allumé.
- **Exporter GPX** : sauvegarde tes points et traces (compatibles avec Garmin, Google Earth, etc.).
- En haut : coordonnées en degrés et en **UTM**, précision du GPS, altitude, lever/coucher du soleil.

## Limites à connaître

- **Écran éteint = pas de trace.** Un navigateur ne peut pas suivre le GPS en arrière-plan. Pour une longue trace, garde l'écran allumé (bouton) et apporte une batterie externe.
- Le GPS du téléphone fonctionne sans réseau cellulaire, mais la première position peut prendre 1 à 2 minutes en forêt dense.
- *Tir permis* = 30 min avant le lever et 30 min après le coucher du soleil, calculés pour ta position. Vérifie toujours les heures et règles officielles de ta zone dans la réglementation de la chasse du Québec.
- Les tuiles viennent d'Esri (satellite) et d'OpenTopoMap (topo), qui demandent un usage personnel raisonnable : télécharge ton secteur, pas toute la province. L'app limite chaque téléchargement à 20 000 tuiles.
- Garde une boussole et une carte papier : un téléphone peut geler ou se vider.

## Mettre à jour l'application

Remplace les fichiers sur GitHub. Si un changement ne paraît pas, augmente le numéro `affut-app-v1` dans `sw.js` (ex. `v2`). Tes points, traces et cartes restent en place.
