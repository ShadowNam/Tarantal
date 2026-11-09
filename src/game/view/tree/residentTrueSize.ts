// v1.20.2 (D-082): the baobab residents' growth to their true size, apart from the frame table
// (residentSheet.ts is in the first download, for the journal's portraits; these are read by the
// lazy residents' view, the art tool and the size table).

/**
 * The residents brought to their true size beside the mid guineafowl (110.5 px standing, 221 px a
 * metre), where they fit the stage-set baobab: the flying barn owl (wingspan 69 → 193 px, 0.87 m;
 * a real one 0.8–0.95 m), the yellow-billed hornbill (×2.3: flying 56.5 → 130 px bill to tail,
 * 0.59 m; clinging 49 → 113 px, 0.51 m; a real one 0.48–0.6 m) and the bushbaby (its head 1.6 →
 * 1.07 of the D-057 drawing: 20 → 13 px wide, 0.06 m). Each drawn from its shapes at that size
 * (tools/art/baobabLife.ts), never scaled up; their frame boxes are D-057's × these
 * (residentSheet.test.ts). The owl in its cavity (head and shoulders through a 38 × 50 px hole)
 * and the buffalo weaver at its 46 × 30 px stick nest stay: a true whole owl or a true weaver
 * would not fit the stage-set tree's hole or nest (tools/sizes.ts NOT_FIXED).
 */
export const RESIDENT_TRUE_MUL = { owlFly: 2.8, hornbill: 2.3, galago: 1.07 / 1.6 } as const;
