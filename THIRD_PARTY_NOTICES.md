# Third-party runtime notices

HardHit source code is distributed under the MIT License in `LICENSE`.

## Babylon.js

The production bundle includes Babylon.js 6.49.0 from the `babylonjs` npm package. The package declares Apache License 2.0. Copies of the package license and notice are included in [`THIRD_PARTY_LICENSES`](THIRD_PARTY_LICENSES/).

## Sound files

The three shipped WAV files are credited individually in [`public/audio/CREDITS.txt`](public/audio/CREDITS.txt):

- `public/audio/bat-impact.wav` — “Willow Bat Knock” by BudgetPixel AI ([source](https://budgetpixel.com/sfx/willow-bat-knock-3da2a28b)).
- `public/audio/stumps.wav` — “Wooden Tower Tumble” by BudgetPixel AI ([source](https://budgetpixel.com/sfx/wooden-tower-tumble-e7bae9a5)).
- `public/audio/crowd-cheer.wav` — “Live Stadium Crowd Roar” by BudgetPixel AI ([source](https://budgetpixel.com/sfx/live-stadium-crowd-roar-ad198e00)).

The source pages identify these clips as CC BY 4.0; see the [license deed](https://creativecommons.org/licenses/by/4.0/). Preserve the attribution, source link and license when redistributing the files, and indicate changes if any are made. BudgetPixel's [terms](https://budgetpixel.com/terms) state that the library license applies “to the extent BudgetPixel holds any rights”; the underlying rights chain beyond that grant has not been independently assessed. Delivery and bounce effects are generated procedurally by the game and are not separate media files.

## Other runtime visuals

The repository contains no separate raster images, vector files, model files, or bundled font files. The pitch, players, equipment, and other game visuals are created in code. The favicon is an inline SVG in `index.html`; CSS uses system font families.

This inventory covers files found in the current repository and the production runtime dependency. It is not a complete notice inventory for development-only npm dependencies.
