// Appens version – EN källa, package.json.
//
// UI-städning Omgång 3 (2026-09-11). Panelhuvudet visade "v4.0", fönstertiteln
// och onboardingen "Beta 2", och package.json sa 0.3.0 – tre olika svar på
// samma fråga. Se docs/troubleshooting/ui_inventering_20260910.md avsnitt B.
//
// Vite och Vitest löser JSON-importen med namngivna exporter, så bara
// versionssträngen hamnar i bundeln – inte hela package.json.
import { version } from '../../package.json';

/** Versionen ur package.json. Höjs med `npm version`, aldrig för hand här. */
export const APP_VERSION = version;

/** Visningsform för UI, t.ex. "v0.4.0". */
export const APP_VERSION_LABEL = `v${version}`;

/** Produktnamn. Hålls här så att titel, panelhuvud och onboarding delar källa. */
export const APP_NAME = 'NätSim';
