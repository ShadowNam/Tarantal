"""Render the repository's illustrated playtest document. No game assets are changed."""
import html
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'docs/playtest-2026-11-14'
data = json.loads((DEST / 'review.json').read_text())
esc = lambda value: html.escape(str(value), quote=True)
parts = []

def add(value):
    parts.append(value)

def paragraph(value):
    add('<p>' + esc(value) + '</p>')

def figure(filename, caption):
    if filename and (DEST / 'images' / filename).is_file():
        add(f'<figure><a href="images/{esc(filename)}" target="_blank" rel="noopener"><img src="images/{esc(filename)}" loading="lazy" alt="{esc(caption)}"></a><figcaption>{esc(caption)} · Click the picture for full size.</figcaption></figure>')

def table(headings, rows):
    add('<div class="table-wrap"><table><thead><tr>' + ''.join('<th>'+esc(h)+'</th>' for h in headings) + '</tr></thead><tbody>')
    for row in rows:
        add('<tr>'+''.join('<td>'+esc(c)+'</td>' for c in row)+'</tr>')
    add('</tbody></table></div>')

add('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tarantal Madness critical playtest</title><style>
:root{color-scheme:light;--ink:#24352c;--paper:#f8f5ec;--green:#17624d;--line:#d6d9ce}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 system-ui,sans-serif}a{color:#075f50;text-underline-offset:3px}header{background:#21382e;color:#fff;padding:48px max(24px,calc((100vw - 1080px)/2))}header a{color:#fff}.eyebrow{text-transform:uppercase;letter-spacing:.13em;font-size:12px;color:#d6c695}h1{font-size:clamp(32px,5vw,55px);line-height:1.12;max-width:850px;margin:12px 0 20px}h2{font-size:30px;line-height:1.25;margin:56px 0 18px;border-top:2px solid var(--line);padding-top:24px}h3{font-size:22px;line-height:1.3;margin:28px 0 10px}main{max-width:1130px;margin:auto;padding:0 24px 70px}p{max-width:900px}.status{border:1px solid #c9b36d;background:#f5edd3;padding:16px 20px;border-radius:10px;margin:24px 0}.verdict{font-size:21px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}.button,button{display:inline-block;border:0;background:#f3cd60;color:#1d3026;padding:11px 18px;text-decoration:none;border-radius:7px;font:700 15px system-ui;cursor:pointer}.secondary{background:#fff;color:#183c2d}.toc{display:flex;gap:10px 22px;flex-wrap:wrap;padding:20px 0;font-size:15px}.toc a{white-space:nowrap}.meta{font-size:14px;color:#ddd9c7}figure{margin:20px 0 30px;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:12px 16px;font-size:14px;line-height:1.5;color:#4e5a52}.finding{background:#fff;border:1px solid var(--line);border-left:5px solid #b48b35;padding:20px 24px;margin:24px 0;border-radius:8px}.finding h3{margin-top:10px}.badge{display:inline-block;font-size:13px;font-weight:750;background:#f0e5ca;padding:3px 9px;border-radius:4px;margin-right:8px}.finding dl{margin:0}.finding dt{font-weight:750;margin-top:14px}.finding dd{margin:3px 0}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px;margin:18px 0}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:10px 12px}th{background:#e9eee5}td:first-child{font-weight:650}details{background:#fff;border:1px solid var(--line);padding:16px;margin:18px 0;border-radius:8px}summary{font-weight:700;cursor:pointer}li{margin:8px 0}code{font-size:13px;overflow-wrap:anywhere}footer{font-size:14px;color:#58665c;border-top:1px solid var(--line);padding-top:20px}section{scroll-margin-top:20px}.print-only{display:none}@media(max-width:600px){body{font-size:16px}header{padding:30px 20px}main{padding:0 16px 40px}.finding{padding:16px}th,td{padding:8px}h2{font-size:25px}}@media print{@page{size:A4;margin:16mm}body{font-size:10pt;background:white}header{background:white;color:#182b20;padding:0}header .meta{color:#444}h1{font-size:27pt}h2{font-size:18pt;margin-top:24px}h1,h2,h3,dt{break-after:avoid}tr{break-inside:avoid}h3{font-size:14pt}.actions,.toc,.no-print{display:none}main{padding:0;max-width:none}.finding{break-inside:avoid;padding:12px}figure{break-inside:avoid}figure img{max-height:140mm;object-fit:contain}figcaption{font-size:9pt}table{font-size:9pt}.table-wrap{overflow:visible}a{color:inherit;text-decoration:none}.print-only{display:block}details.case-list{display:none}section{break-before:auto}}
</style></head><body><header><div class="eyebrow">Critical playtest perspective · Owner review</div>''')
add('<h1>'+esc(data['title'])+'</h1>')
add('<div class="meta">'+esc(data['date']+' · '+data['build'])+'</div>')
add('<div class="actions"><a class="button" href="play/">Play game</a><button class="secondary" onclick="window.print()">Print / save as PDF</button>')
if (DEST/'full-review.pdf').exists(): add('<a class="button secondary" href="full-review.pdf" download>Download full review + evidence PDF</a>')
if (DEST/'report.pdf').exists():
    pdf_label='Download draft PDF' if 'progress' in data['status'].lower() else 'Download illustrated PDF'
    add('<a class="button secondary" href="report.pdf" download>'+pdf_label+'</a>')
add('<a class="button secondary" href="review.json" download>Download findings data</a></div></header><main>')
add('<nav class="toc" aria-label="Report sections">'+''.join(f'<a href="#{k}">{v}</a>' for k,v in [('verdict','Verdict'),('journey','Start to finish'),('works','What works'),('findings','Critical findings'),('order','Fix sequence'),('areas','All areas'),('coverage','Feature coverage'),('animals','Animal HD inventory'),('limits','Test limits')])+'</nav>')
add('<div class="status"><strong>'+esc(data['status'])+'</strong>. This document separates observed faults, usability assessments and proposed additions. P1 = release verification or serious risk; P2 = important polish; P3 = later improvement. “Fixed” is not an open issue.</div>')
add('<p class="print-only">Original-size images and raw evidence are available in this task’s tank Preview. The full review PDF also includes the map, language and test-ledger appendices.</p>')
add('<section id="verdict"><h2>Verdict and testing perspective</h2><p class="verdict">'+esc(data['verdict'])+'</p>')
paragraph(data['perspective']);paragraph(data['scope']);
if data.get('applied_changes'):
    add('<h3>Changes already applied</h3>');table(['Area','Delivered change'],data['applied_changes'])
add('</section>')
add('<section id="journey"><h2>Start-to-finish game flow</h2>')
table(['Route','Sequence','Assessment'],data.get('journey',[]))
add('<h3>Real-quota balance sample</h3>')
paragraph('The earlier competent-bot sample played 100 seeds per buying policy with the real twelve-hunt quotas. Rates below are conditional on reaching a season, so the denominator shrinks later in the run. The target band is the existing target ±10 percentage points.')
table(['Season','Buying policy','Runs reaching season','Pass rate','Existing target','Comparison'],data.get('balance',[]))
paragraph('Nineteen of 100 synergy-policy runs completed the season; none of the no-charm-policy runs did. Shop decisions therefore matter in this model. Spring without charms and Summer with synergy exceeded the old target bands. That does not justify making the game harder without player evidence. Test beginner comprehension and actual player quota margins before retuning.')
add('<p class="no-print"><a href="season-balance.json" download>Download the full balance sample</a></p></section>')
if all((DEST/('harvest-'+kind+'.json')).exists() for kind in ['pointer','touch']):
    import statistics
    add('<section id="harvest-balance"><h2>Harvest bonus-round reachability</h2>')
    paragraph('Unchanged content, seeds 1–100, the existing plinker/competent/strong bots and both input profiles: 600 simulated hunts. The 1,850-point threshold and crop requirement are not overridden. These are defined bot behaviours, not measured beginner/expert human completion rates; touch is a simulation error profile, not physical-device input testing.')
    harvest_rows=[]
    for kind in ['pointer','touch']:
        sample=json.loads((DEST/('harvest-'+kind+'.json')).read_text())
        for bot in sample['bots']:
            hunts=[r for r in sample['rows'] if r['bot']==bot]
            unlocked=sum('p2' in r for r in hunts)
            median=statistics.median(r.get('rushScore',0) for r in hunts)
            harvest_rows.append([kind,bot,len(hunts),f'{median:.0f}',f'{unlocked}/{len(hunts)}'])
    table(['Input profile','Bot','Hunts','Median rush score incl. crop bonus','Phase 2 reached'],harvest_rows)
    paragraph('This sample checks reachability under the real rule. It does not establish whether a young first-time player understands the objective or finds the difficulty fair. No tuning values were changed.')
    add('<p class="no-print"><a href="harvest-pointer.json" download>Pointer sample</a> · <a href="harvest-touch.json" download>Touch-profile sample</a></p></section>')
add('<section id="works"><h2>What works well</h2>')
for title,body,pic in data['strengths']:
    add('<h3>'+esc(title)+'</h3>');paragraph(body);figure(pic,title)
add('</section><section id="findings"><h2>Critical findings</h2>')
for f in data['findings']:
    add(f'<article class="finding" id="{esc(f["id"])}"><span class="badge">{esc(f["id"])} · {esc(f["priority"])}</span><span>{esc(f["kind"])}</span><h3>{esc(f["title"])}</h3><dl>')
    for k,label in [('reproduce','Where / how to reproduce'),('observed','Observed'),('impact','Why it matters'),('action','Action / recommendation'),('acceptance','Acceptance criteria')]:
        add('<dt>'+label+'</dt><dd>'+esc(f[k])+'</dd>')
    
    if f.get('source'): add('<dt>Source evidence</dt><dd><code>'+esc(f['source'])+'</code></dd>')
    add('</dl>');figure(f.get('evidence'),f['id']+' original evidence: '+f['title'])
    if f.get('afterEvidence'): figure(f['afterEvidence'],f['id']+' after correction: '+f.get('afterCaption',''))
    add('</article>')
add('</section><section id="order"><h2>Recommended sequence</h2>')
table(['Order','Work','Why / scope','Findings'],data['sequence']);add('</section>')
add('<section id="areas"><h2>All five hunting areas</h2>')
if (DEST/'map-results.json').exists():
    add('<p class="no-print"><a href="map-atlas.html">Open the illustrated level-by-level appendix</a> · <a href="map-results.json" download>Download individual map results</a></p>')
area_notes=[
('karoo-autumn','Karoo','A clear introductory environment with familiar farm landmarks. The targets stand out against the ochre ground. Review the amount of small ground detail around low birds and keep interactive props distinguishable from decoration.'),
('bushveld-winter','Bushveld','The baobab gives the scene a strong focal point and its residents add character. Giraffes and striped herds create a busy upper background; their simpler rendering contrasts with the detailed target birds.'),
('okavango-spring','Okavango','Water, reeds and the sausage tree communicate the wetland setting clearly. Elephants are very prominent and comparatively flat in shading. This is the first herd artwork I would revise, within the existing texture budget.'),
('kalahari-summer','Kalahari','The red earth and windpump establish a distinct palette. Weaver and meerkat systems give it an identity beyond a colour swap. Check low targets and burrow interactions against foreground vegetation on a phone.'),
('namibie','Namibië','The pale pan, red dunes, quiver trees and desert wildlife read as a separate destination. Its long-range play and scope requirement are meaningful progression. Verify that first-time visitors understand distance and sight requirements rather than interpreting small distant birds as a rendering problem. In the seed-7 map captures, a large protected ostrich is prominent near the central target lane; include target/protected-animal recognition in novice testing. This is a composition concern, not a demonstrated hit-detection fault.')]
for key,name,note in area_notes:
    add('<h3>'+name+'</h3>');paragraph(note);figure('normal-'+key+'.png',name+' · HD assets / default Medium render tier · Saturday dusk · seed 7 · ordinary event population, no all-cameos preview')
paragraph('These five pictures are representative scene inspections, not proof that every weekday, weather condition and bonus map was played to completion. Functional cases below identify the additional combinations tested.')
quality_path=DEST/'high-quality-results.json'
if quality_path.exists():
    quality_rows=json.loads(quality_path.read_text())
    add('<h3>HD artwork at the highest render tier</h3>')
    paragraph('Graphics selects Standard or HD assets; Quality selects rendering scale and effects. The original overview pictures above use the default Medium tier. This separate comparison explicitly sets High: full render scale 1.0, vignette and bloom. Medium uses scale 0.83 and vignette. All six captures use 1280×720, device pixel ratio 1, seed 7, Saturday layout, HD assets and exactly simulation tick 300 (five seconds into a normal 90-second hunt).')
    table(['Area','Tier','Render scale','HD textures registered','Result'],[[r['biome'],r['tier'],r.get('observed',{}).get('renderScale','—'),r.get('observed',{}).get('graphics',{}).get('hdTextures','—'),r['status']] for r in quality_rows])
    paragraph('The matched Bushveld images show that High changes rendering and effects but does not replace Standard-only herd drawings with new artwork. Detailed target birds still contrast with flatter giraffe and zebra herds. Sharper output alone cannot resolve anatomy, shading or style consistency. These static captures do not establish frame rate or physical-device performance; registered texture totals exclude effect buffers and total GPU memory.')
    for r in quality_rows:
        if r.get('image'): figure(Path(r['image']).name,r['biome']+' · HD assets · '+r['tier'].title()+' render tier · matched tick 300')
    add('<p class="no-print"><a href="high-quality-results.json" download>Exact graphics-tier capture results</a></p>')
add('</section>')
add('<section id="coverage"><h2>Functional coverage and evidence</h2>')
paragraph('Earlier review validation passed 2,597 unit tests in 300 files, all 57 content files, the production build, the full asset audit and the strict 2.94 MiB Standard first-playable download budget. The earlier targeted browser pass completed 36 checks including the twelve-hunt ending. Those results are retained separately from the wider sweep below.')
result_path=DEST/'browser-results.json'
if result_path.exists():
    result=json.loads(result_path.read_text());cases=[]
    def walk(suites):
        for suite in suites:
            for spec in suite.get('specs',[]):
                for test in spec.get('tests',[]):
                    rr=test.get('results',[])
                    cases.append((Path(spec.get('file',suite.get('file',''))).name,spec['title'],{'expected':'passed','unexpected':'failed'}.get(test.get('status'),test.get('status','unknown')),('≈ '+f"{sum(r.get('duration',0) for r in rr)/1000:g}") if spec.get('evidence') else round(sum(r.get('duration',0) for r in rr)/1000,1)))
            walk(suite.get('suites',[]))
    walk(result.get('suites',[]))
    if result.get('provenance'): paragraph(result['provenance'])
    counts=Counter(c[2] for c in cases)
    paragraph('Wider desktop sweep: '+', '.join(f'{v} {k}' for k,v in sorted(counts.items()))+'. Skips are exclusions, not passes. Any reruns and the final disposition of failures are documented in the findings.')
    grouped=defaultdict(Counter)
    for file,title,status,duration in cases: grouped[file][status]+=1
    table(['Feature / test file','Result'],[(file.replace('.spec.ts','').replace('-',' '),', '.join(f'{v} {k}' for k,v in sorted(count.items()))) for file,count in sorted(grouped.items())])
    add('<details class="case-list"><summary>Every browser case and result</summary>');table(['Feature','Case','Outcome','Seconds'],cases);add('</details>')
    add('<p class="no-print"><a href="browser-results.json" download>Download the complete browser result file</a></p>')
else:
    paragraph('The 246-case desktop sweep is still running. Its final per-feature and per-case results will appear here when complete. No pending case is counted as passed.')
    if (DEST/'progress.json').exists():
        progress=json.loads((DEST/'progress.json').read_text())
        d=progress['desktop']; m=progress['maps']
        paragraph(f"Live checkpoint: desktop {d['passed']} passed, {d['failed']} failed on first attempt and {d['skipped']} skipped of {d['planned']} cases. Map sweep: {m['passed']} passed of {m['planned']}. See the additional checks for any corrected-test reruns. Refresh this page for the latest checkpoint.")
if data.get('additional_results'):
    table(['Additional check','Result / qualification'],data['additional_results'])
evidence_files=[('startup-rerun.log','Isolated startup timing log'),('diagnostics/startup-isolated-trace.zip','Isolated startup trace'),('speech-results.json','English greeting rerun'),('diagnostics/speech-initial-trace.zip','Original English screenshot-path failure'),('desktop-interrupted.log','Original interrupted desktop log'),('desktop-first-segment-results.json','Reconstructed 191 recorded outcomes'),('desktop-case-catalog.json','Test catalogue used to match case names (collection only)'),('desktop-resume-results.json','Native resumed desktop results'),('desktop-resume.log','Resumed desktop log'),('diagnostics/braai-initial-trace.zip','Original Braai failure trace'),('diagnostics/feesdae-initial-trace.zip','Original owl failure trace'),('diagnostics/hunt-initial-trace.zip','Original startup failure trace'),('diagnostics/maps-initial-trace.zip','Original midnight screenshot failure trace'),('diagnostics/okavango-initial-trace.zip','Original interrupted Okavango trace'),('harvest-picture-results.json','Harvest presentation capture evidence'),('okavango-startup-network.json','Interrupted Okavango script requests'),('okavango-results.json','Okavango scenery/rain rerun'),('midnight-results.json','UTC-midnight unlock rerun'),('harvest-summary.json','Harvest rule and reachability summary'),('normal-hunt-result.json','Full 90-second hunt result'),('build-fingerprints.json','Runtime versions and build fingerprints'),('startup-results.json','Isolated startup-speed rerun'),('download-size.log','Final strict download budget'),('preview-check.json','Actual Preview production startup'),('copy-evidence.html','Four-language before-release screenshots'),('copy-fix-initial.json','Initial copy-capture assertion mismatch'),('owl-results.json','Owl penalty and scold rerun'),('earlier-desktop.log','Earlier selected desktop run'),('earlier-season-ending.log','Earlier twelve-hunt ending rerun'),('earlier-modes.log','Earlier modes and persistence'),('earlier-phone.log','Earlier phone profiles'),('earlier-interrupted.log','Earlier interrupted attempt'),('webkit-area-results.json','Five HD areas in WebKit'),('copy-fix-results.json','Four-language copy-fix verification'),('map-first-pass-results.json','Original complete map sweep'),('map-initial-failures.json','Initial map timeout/failure record'),('code-check.log','Full code validation log'),('methodology.txt','Detailed test methodology'),('memory-results.json','Initial HD memory results'),('phone-results.json','Initial phone results'),('rerun-results.json','Braai skip rerun'),('transition-results.json','Rain-to-braai rerun'),('touch-results.json','Touch hold rerun'),('low-memory-results.json','Corrected Low-tier results'),('visual-inspection.json','Visual inspection record'),('webkit-results.json','WebKit engine results'),('padstal-results.json','Large-text phone rerun'),('public-results.json','Production Daily safeguards'),('case-ledger.html','Complete browser attempt ledger')]
links=[f'<a href="{name}"'+('' if name.endswith('.html') else ' download')+f'>{label}</a>' for name,label in evidence_files if (DEST/name).exists()]
if links: add('<p class="no-print">Supporting evidence: '+' · '.join(links)+'</p>')
if data.get('gallery'):
    add('<h3>Mode and feature screenshots</h3>')
    for item in data['gallery']: figure(item['file'],item['caption'])
add('</section><section id="animals"><h2>Which animals still lack HD artwork?</h2>')
paragraph('Across 59 animal sheet/plane entries: 24 have HD variants, 5 use native high-resolution masters in both modes, and 30 remain Standard-only. These are asset-role counts, not 59 distinct species.')
paragraph('The answer is not “everything is HD.” Rare/boss bird atlases, the common guineafowl’s near plane, distant herds and Harvest phase 2 remain Standard by the existing mobile-memory policy. The improved binocular meerkat now uses native 2× art. Native high-resolution sheets do not need a duplicate HD file.')
paragraph('The same animal can have different delivery in different roles. Common guineafowl have HD mid/far atlases but a Standard near-plane atlas. Ostriches, springbok and gemsbok have HD-supported cameo/mid sheets while their distant-herd versions remain Standard. Judge the actual on-screen role, not just the species name.')
table(['Animal / role','Resolution status'],[
 ['Common guineafowl, near pop-ups','Standard atlas; the mid and far versions have HD atlases.'],
 ['Generaal, Kuifkop, Kuifkop Koning, Ou Grys, Stormvoël, white and lavender guineafowl','No separate HD atlases under the existing mobile-memory policy.'],
 ['Distant elephants, giraffes, wildebeest, zebras, springbok, ostriches, gemsbok and lechwe','Standard distant-herd sheets, including the mixed waterhole.'],
 ['Harvest phase 2 warthogs, piglets and baboons','Standard shared sheet; the original Harvest sheet has an HD twin.'],
 ['Cameo warthogs/piglets and dung beetle; Karoo ostrich and leopard tortoise; springbok; gemsbok','Their cameo sheets have HD twins. Runtime use can still fall back when memory is tight.'],
 ['Brakkie, baboons, hippo, lily frog, mid-plane Namibië ostriches and other listed HD sheets','HD versions are supplied; see exact sheet entries below.'],
 ['Meerkat helper, desert meerkats, dassie scene, Halloween bats and owls','Native high-resolution sheets in both modes; no duplicate HD file is required.'],
 ['Weaver colony and separate weaver sprites','The colony uses native 3× bird drawings; separate wing sprites have HD twins.']
])
figure('animal-identification.png','Delivered Standard bird frames and the improved native 2× helper. Fitted to cards for identification; these are not in-game sizes or an HD comparison.')
add('<p class="no-print"><a href="animal-examples.html">Open the animal identification cards</a> · <a href="animal-examples.json" download>Frame and source evidence</a></p>')
paragraph('Why not double every texture immediately? A 2048 × 1024 near-bird atlas occupies 8 MiB under the registered RGBA estimate. Doubling both dimensions makes it 32 MiB: 24 MiB extra for that one atlas. A 2048 × 512 rare-bird atlas similarly adds 12 MiB. These illustrative costs exclude trimming and lifetime changes; they are not measured device allocations. The 248.3 MiB Harvest stress sample leaves only 7.7 MiB below the current 256 MiB texture target, so an indiscriminate upgrade needs a new budget and cleanup pass.')
add('<h3>Animal-art work order</h3>')
paragraph('Recommended art order based on prominence in the inspected scenes, not measured player viewing time. Start with drawing and atlas cleanup at existing dimensions; a separate memory check must justify any increase in resolution.')
table(['Order','Animal / sheet','First change to evaluate'],[
 ['1','Common guineafowl near-plane atlas','Polish the prominent close target: silhouette, feather edges, lighting and animation consistency. Preserve hitboxes and world size.'],
 ['2','Harvest phase 2: warthogs, piglets and baboons','Review the large jumping, squeezing and climbing poses at actual screen size. Improve anatomy and shading within the shared Standard sheet before adding pixels.'],
 ['3','Okavango/Bushveld elephants, then Bushveld giraffes','Improve form and lighting in the prominent herd silhouettes; retain enough contrast to keep shootable birds distinct.'],
 ['4','Generaal, Kuifkop, Kuifkop Koning, Ou Grys, Stormvoël, white/lavender guineafowl','Check each rare role at its delivered display size. Improve edges and pose readability, then evaluate trimmed selective HD atlases.'],
 ['5','Remaining distant zebras, wildebeest, springbok, ostriches, gemsbok and lechwe','Match shading and palette across environments. Keep distant-only textures compact where additional detail is not visible.']
])
paragraph('The 59-entry inventory checks delivered image dimensions and whether HD twins exist. It does not grade anatomy, animation quality or artistic finish. The screenshots and finding F05 address that separate question.')
rows=[]
for line in (ROOT/'docs/ANIMAL-ART-AUDIT.md').read_text().splitlines():
    if line.startswith('| ') and not line.startswith('| Asset') and not line.startswith('| ---'):
        rows.append([x.strip() for x in line.strip('|').split('|')])
add('<details><summary>Complete 59-entry animal-art inventory</summary>');table(['Animal sheet / plane','Standard pixels','Delivery'],rows);add('</details>')
add('</section><section id="limits"><h2>Test limits and release gates</h2><ul>')
for line in data['limitations']: add('<li>'+esc(line)+'</li>')
add('</ul></section><footer>Report and images are stored with the project. The Preview server serves the report separately from the game, so this evidence is not bundled into the game’s precache or first-playable download. Findings data: review.json. Screenshot links are relative and remain usable through the remote Preview.</footer></main></body></html>')
(DEST/'index.html').write_text('\n'.join(parts))
print('Rendered',DEST/'index.html')

# A separate appendix keeps the main document readable while retaining every map screenshot.
if (DEST/'map-results.json').exists():
    maps=json.loads((DEST/'map-results.json').read_text())
    counts=Counter(m['status'] for m in maps)
    atlas=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tarantal level-by-level appendix</title><style>body{font:16px/1.6 system-ui;background:#f8f5ec;color:#24352c;max-width:1100px;margin:auto;padding:24px}a{color:#075f50}figure{margin:24px 0;border:1px solid #ccd1c7;background:white;padding:12px;break-inside:avoid}img{width:100%;height:auto}figcaption{font-size:14px}h2{margin-top:48px}code{overflow-wrap:anywhere}nav{display:flex;gap:18px;flex-wrap:wrap}@media print{h2,h3,h2+p{break-after:avoid}figure{break-inside:avoid}nav{display:none}}</style><a href="./">← Main report</a><h1>Level-by-level appendix</h1>']
    atlas.append('<p>'+esc(str(len(maps))+' of 145 planned configurations recorded: '+', '.join(f'{v} {k}' for k,v in counts.items()))+'</p>')
    atlas.append('<p>Each run uses a deterministic seed, Standard art and a shortened 12-second Classic hunt. It checks startup, the requested area/layout/bonus combination, missing assets, browser errors and arrival at the tally. Because Stampede covers the final fifteen seconds, these twelve-second hunts begin inside Stampede. Bonus ranges are selected directly with an appropriate rifle; this does not replace the separate unlock-gating tests or normal-length difficulty testing.</p>')
    atlas.append('<nav>'+''.join('<a href="#'+esc(b)+'">'+esc(b)+'</a>' for b in dict.fromkeys(m['biome'] for m in maps))+'</nav>')
    previous=None
    for m in maps:
        if m['biome']!=previous:
            atlas.append('<h2 id="'+esc(m['biome'])+'">'+esc(m['biome'])+'</h2>');previous=m['biome']
        label=m['layout']+' · '+m['bonus']+' · '+m['status']
        atlas.append('<figure><h3>'+esc(label)+'</h3>')
        if m.get('image') and (DEST/m['image']).exists():
            atlas.append('<a href="'+esc(m['image'])+'" target="_blank" rel="noopener"><img src="'+esc(m['image'])+'" loading="lazy" alt="'+esc(m['id'])+'"></a>')
        detail=m.get('failure','Requested scene reached and end-of-hunt tally checked.' if m['status']=='passed' else 'Run not yet completed.')
        if m.get('initialFailure'): detail+=' Initial attempt: '+m['initialFailure']+' This result is from the longer rerun.'
        atlas.append('<figcaption>'+esc('Configuration '+m['id']+'. '+detail)+'</figcaption></figure>')
    failure_path=DEST/'map-initial-failures.json'
    if failure_path.exists():
        failures=json.loads(failure_path.read_text())
        if failures: atlas.append('<h2>Preserved initial failure captures</h2><p>These pictures show the original timed-out or failed attempts. The configuration result above records any later rerun.</p>')
        for failed in failures:
            screenshot='maps/'+failed['id']+'-failure.jpg'
            if (DEST/screenshot).exists():
                atlas.append('<figure><h3>'+esc(failed['id'])+'</h3><img src="'+esc(screenshot)+'" loading="lazy" alt="Original failed attempt"><figcaption>'+esc(failed.get('failure','')+' '+failed.get('disposition',''))+'</figcaption></figure>')
    atlas.append('</html>');(DEST/'map-atlas.html').write_text('\n'.join(atlas))

# Keep every language capture accessible without crowding the main findings.
copy_path=DEST/'copy-fix-results.json'
if copy_path.exists():
    copy_rows=json.loads(copy_path.read_text())
    out=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Copy-fix verification</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:auto;padding:24px;color:#24352c}img{width:100%;height:auto}figure{margin:24px 0;break-inside:avoid}h2{break-after:avoid}@media print{body{font-size:10pt}figure{break-inside:avoid}}</style><a href="./">Main report</a><h1>Four-language copy-fix verification</h1><p>Separate build after the frozen baseline sweep began. Chromium, 915×412 viewport, Large text and high contrast. Short two-second hunts check the completion announcement; they do not measure difficulty. Original fault pictures appear in the main findings.</p>']
    for row in copy_rows:
        out.append('<h2>'+esc(row['language']+' · '+row['status'])+'</h2><p>'+esc(row.get('news',row.get('failure','Pending')))+'</p>')
        for file in row.get('images',[]):
            out.append('<figure><a href="'+esc(file)+'"><img loading="lazy" src="'+esc(file)+'" alt="'+esc(Path(file).stem)+'"></a><figcaption>'+esc(Path(file).stem.replace('-', ' '))+'</figcaption></figure>')
    out.append('</html>');(DEST/'copy-evidence.html').write_text('\n'.join(out))
