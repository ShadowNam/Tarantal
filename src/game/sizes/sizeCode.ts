// v1.22.1 (D-086): the code constants an owner-set size may name (`code:` paths, src/content/
// sizePaths.ts), as built: boot applies such an edit as a view factor only while the constant still
// has the edit's `from` (once the apply tool's report is acted on, the edit is in the art).
import { RESIDENT_TRUE_MUL } from '../view/tree/residentTrueSize';

const RESIDENTS = 'code:src/game/view/tree/residentTrueSize.ts#RESIDENT_TRUE_MUL';

export const SIZE_CODE_VALUES: Readonly<Record<string, number>> = {
  [`${RESIDENTS}.owlFly`]: RESIDENT_TRUE_MUL.owlFly,
  [`${RESIDENTS}.hornbill`]: RESIDENT_TRUE_MUL.hornbill,
  [`${RESIDENTS}.galago`]: RESIDENT_TRUE_MUL.galago,
};
