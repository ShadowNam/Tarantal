# Delivered animal artwork audit

Generated with `npm run assets:animals`. This checks delivered resolution and HD coverage, not artistic quality. Sheet dimensions include multiple frames; they are not an individual animal's screen size. Native masters do not need duplicate HD files. Covers gameplay animal sheets and sprites, including Halloween bats and owls, hippos, frogs and weavers; excludes UI icons, toys and scenery illustrations.

59 animal sheet/plane entries; 0 unexplained resolution or image-dimension gaps.

| Asset | Standard texture pixels | Delivery |
| --- | --- | --- |
| baboons/sheet | 756 × 903 | HD twin: 1512 × 1806 |
| brakkie/sheet | 672 × 529 | HD twin: 1344 × 1058 |
| bushveld/baobab_life | 336 × 447 | HD twin: 672 × 894 |
| bushveld/dassie_koppie | 1120 × 600 | Native ≥2× in both modes |
| cameos/bushveld | 528 × 257 | HD twin: 1056 × 514 |
| cameos/kalahari | 560 × 332 | HD twin: 1120 × 664 |
| cameos/karoo | 608 × 751 | HD twin: 1216 × 1502 |
| cameos/namibie | 928 × 605 | HD twin: 1856 × 1210 |
| desert/colony | 768 × 362 | Native 3× bird drawings inside the shared sheet |
| desert/meerkats | 1792 × 1152 | Native ≥2× in both modes |
| fauna/bushveld_elephants | 391 × 834 | Standard in HD: distant herd, mobile texture budget |
| fauna/bushveld_giraffes_a | 406 × 642 | Standard in HD: distant herd, mobile texture budget |
| fauna/bushveld_wildebeest | 142 × 708 | Standard in HD: distant herd, mobile texture budget |
| fauna/bushveld_zebra | 400 × 311 | Standard in HD: distant herd, mobile texture budget |
| fauna/kalahari_ostrich | 319 × 146 | Standard in HD: distant herd, mobile texture budget |
| fauna/kalahari_springbok | 367 × 137 | Standard in HD: distant herd, mobile texture budget |
| fauna/kalahari_wildebeest | 142 × 708 | Standard in HD: distant herd, mobile texture budget |
| fauna/karoo_ostrich | 238 × 257 | Standard in HD: distant herd, mobile texture budget |
| fauna/karoo_springbok_a | 153 × 303 | Standard in HD: distant herd, mobile texture budget |
| fauna/karoo_springbok_b | 80 × 397 | Standard in HD: distant herd, mobile texture budget |
| fauna/namibie_gemsbok | 409 × 230 | Standard in HD: distant herd, mobile texture budget |
| fauna/namibie_ostrich | 319 × 146 | Standard in HD: distant herd, mobile texture budget |
| fauna/namibie_waterhole | 210 × 455 | Standard in HD: distant herd, mobile texture budget |
| fauna/namibie_zebra | 483 × 201 | Standard in HD: distant herd, mobile texture budget |
| fauna/okavango_elephants | 391 × 834 | Standard in HD: distant herd, mobile texture budget |
| fauna/okavango_lechwe | 251 × 410 | Standard in HD: distant herd, mobile texture budget |
| fauna/okavango_wildebeest | 142 × 500 | Standard in HD: distant herd, mobile texture budget |
| fauna/okavango_zebra | 483 × 201 | Standard in HD: distant herd, mobile texture budget |
| feesdae/halloween | 1920 × 1882 | Native ≥2× in both modes |
| fx/weaver_down | 96 × 64 | HD twin: 192 × 128 |
| fx/weaver_up | 96 × 64 | HD twin: 192 × 128 |
| helper/meerkat | 240 × 440 | Native ≥2× in both modes |
| namibie/ostriches | 1440 × 1146 | HD twin: 2880 × 2292 |
| oes/harvest | 1536 × 1173 | HD twin: 3072 × 2346 |
| oes/harvest2 | 1024 × 492 | Standard in HD: mobile texture budget |
| okavango/hippo | 320 × 190 | HD twin: 640 × 380 |
| okavango/lily_frog | 180 × 200 | HD twin: 360 × 400 |
| tells/sheet | 340 × 668 | HD twin: 680 × 1336 |
| bird/fisant/far | 1024 × 64 | HD animation atlas supplied |
| bird/fisant/mid | 2048 × 128 | HD animation atlas supplied |
| bird/generaal/mid | 2048 × 512 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/hadeda/far | 512 × 64 | HD animation atlas supplied |
| bird/kuifkop/mid | 2048 × 512 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/kuifkop_koning/mid | 2048 × 512 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/kwevoel/mid | 1024 × 256 | HD animation atlas supplied |
| bird/ou_grys/mid | 2048 × 512 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/sproeier/far | 1024 × 64 | HD animation atlas supplied |
| bird/stormvoel/far | 2048 × 64 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/stormvoel/mid | 2048 × 512 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/tarentaal/far | 2048 × 128 | HD animation atlas supplied |
| bird/tarentaal/mid | 2048 × 512, 2048 × 128 | HD animation atlas supplied |
| bird/tarentaal/near | 2048 × 1024 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/tarentaal_lavendel/far | 2048 × 64, 256 × 64 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/tarentaal_lavendel/mid | 2048 × 512 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/tarentaal_wit/far | 2048 × 64, 256 × 64 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/tarentaal_wit/mid | 2048 × 512 | Standard in HD: near/rare bird atlas, mobile texture budget |
| bird/tortelduif/far | 1024 × 64 | HD animation atlas supplied |
| bird/tortelduif/mid | 2048 × 128 | HD animation atlas supplied |
| bird/visarend/far | 512 × 64 | HD animation atlas supplied |

The rare birds still without HD atlases are Generaal, Kuifkop, Kuifkop Koning, Ou Grys, Stormvoël, white and lavender guineafowl. The common guineafowl's near-plane atlas also remains Standard. Distant herds and Harvest phase 2 share Standard art between modes. These are explicit memory-budget exclusions, not missing files. See `src/game/assets/hdPack.ts` and `src/game/assets/animalDensity.test.ts`.

All delivered art remains marked interim by the existing asset pipeline. Higher resolution alone does not make it final production artwork.
