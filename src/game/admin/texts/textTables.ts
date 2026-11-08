// v1.14 (D-076): every text table the "Texts & voices" tab lists, and the voice tool's `say` lines
// (tools/audio/voice.config.json). Imported only by the tab (the admin page's lazy chunk), so the
// lazy tables (guide, braai, privacy, graphics) load when the tab opens and the first download
// carries none of this.
import mainAf from '../../../i18n/af.json';
import mainDe from '../../../i18n/de.json';
import mainEn from '../../../i18n/en.json';
import mainNl from '../../../i18n/nl.json';
import names from '../../../i18n/flavour/afNames.json';
import guideAf from '../../../i18n/guide/af.json';
import guideDe from '../../../i18n/guide/de.json';
import guideEn from '../../../i18n/guide/en.json';
import guideNl from '../../../i18n/guide/nl.json';
import braaiAf from '../../../i18n/braai/af.json';
import braaiDe from '../../../i18n/braai/de.json';
import braaiEn from '../../../i18n/braai/en.json';
import braaiNl from '../../../i18n/braai/nl.json';
import privacyAf from '../../../i18n/privacy/af.json';
import privacyDe from '../../../i18n/privacy/de.json';
import privacyEn from '../../../i18n/privacy/en.json';
import privacyNl from '../../../i18n/privacy/nl.json';
import graphicsAf from '../../../i18n/graphics/af.json';
import graphicsDe from '../../../i18n/graphics/de.json';
import graphicsEn from '../../../i18n/graphics/en.json';
import graphicsNl from '../../../i18n/graphics/nl.json';
import voiceConfig from '../../../../tools/audio/voice.config.json';
import type { SayTable, TextTables } from './textLines';

export const TEXT_TABLE_DATA: TextTables = {
  main: { en: mainEn, af: mainAf, de: mainDe, nl: mainNl },
  guide: { en: guideEn, af: guideAf, de: guideDe, nl: guideNl },
  braai: { en: braaiEn, af: braaiAf, de: braaiDe, nl: braaiNl },
  privacy: { en: privacyEn, af: privacyAf, de: privacyDe, nl: privacyNl },
  graphics: { en: graphicsEn, af: graphicsAf, de: graphicsDe, nl: graphicsNl },
  names,
};

export const SAY_DATA: SayTable = voiceConfig.say;
