// D-045 Project overview styles: the admin page's colours and font (AdminPanel.ts), a compact
// header for phones in landscape (iPhone 14: ~340 CSS px tall), a single column on phones and two
// on wide screens, every button and link ≥ 44 px, touch scrolling (pan-y) in the body only.
export const PROJECT_CSS = `
#tm-project{--bg:#1b1410;--top:#241a14;--card:#2b211a;--card2:#33271e;--line:#5a4632;--line2:#3a2e24;
  --text:#F3EAD3;--muted:#C9BFA6;--gold:#FFD25A;--btn:#3a2e24;--btnline:#8a7458;
  --ok:#6fbf5a;--review:#6fa8dc;--run:#e5a82e;--block:#e0664f;--later:#8a7458;
  position:fixed;inset:0;z-index:21;display:flex;flex-direction:column;background:var(--bg);color:var(--text);
  font:15px/1.4 'Baloo 2',system-ui,sans-serif;outline:none;box-sizing:border-box;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)}
#tm-project *{box-sizing:border-box}
#tm-project [hidden]{display:none!important}
#tm-project :focus-visible{outline:3px solid var(--gold);outline-offset:2px}
#tm-project .top{flex:none;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"ttl acts" "tabs tabs";
  align-items:center;column-gap:12px;padding:8px 12px 0;background:var(--top);border-bottom:1px solid var(--line)}
#tm-project .ttl{grid-area:ttl;min-width:0}
#tm-project h1{margin:0;font-size:21px;line-height:1.2;color:var(--gold)}
#tm-project .meta{display:block;color:var(--muted);font-size:13px;line-height:1.35}
#tm-project .meta b{color:var(--text);font-weight:700}
#tm-project .acts{grid-area:acts;display:flex;gap:8px;justify-content:flex-end}
#tm-project .tabs{grid-area:tabs;display:flex;gap:2px;min-width:0;margin-top:4px;overflow-x:auto;overflow-y:hidden;
  touch-action:pan-x;scrollbar-width:none;-webkit-overflow-scrolling:touch}
#tm-project .tabs::-webkit-scrollbar{display:none}
#tm-project .tab{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:44px;min-width:44px;padding:4px 14px;
  border:0;border-bottom:3px solid transparent;background:none;color:var(--muted);font:inherit;font-weight:700;
  cursor:pointer;touch-action:manipulation;white-space:nowrap}
#tm-project .tab:hover{color:var(--text)}
#tm-project .tab[aria-selected=true]{color:var(--gold);border-bottom-color:var(--gold)}
#tm-project .badge{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:11px;
  background:var(--block);color:#fff;font-size:13px;font-weight:800;line-height:1}
#tm-project .badge.zero{background:var(--ok);color:#13200f}
#tm-project .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;
  padding:4px 14px;border-radius:8px;border:2px solid var(--btnline);background:var(--btn);color:var(--text);
  font:inherit;font-weight:700;cursor:pointer;touch-action:manipulation;white-space:nowrap;text-decoration:none}
#tm-project .btn:hover{border-color:var(--gold)}
#tm-project .btn:disabled{opacity:.6;cursor:progress}
#tm-project .btn .short{display:none}
#tm-project .body{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;touch-action:pan-y;
  -webkit-overflow-scrolling:touch;overscroll-behavior:contain}
#tm-project.lb-open .body{overflow:hidden}
#tm-project .wrap{max-width:1180px;margin:0 auto;padding:12px 16px calc(28px + env(safe-area-inset-bottom))}
#tm-project section{margin:0 0 18px}
#tm-project h2{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:17px;line-height:1.25;color:var(--gold)}
#tm-project h2 .count{color:var(--muted);font-size:14px;font-weight:600}
#tm-project h3{margin:0;font-size:16px;line-height:1.3}
#tm-project p{margin:0 0 6px}
#tm-project .pl{white-space:pre-line;overflow-wrap:anywhere}
#tm-project .small{font-size:13.5px}
#tm-project .muted{color:var(--muted);font-size:13px}
#tm-project .label{color:var(--muted);font-size:12.5px;font-weight:700;margin-top:6px;text-transform:uppercase;letter-spacing:.04em}
#tm-project .meta-line{margin-top:4px}
#tm-project .empty{padding:6px 0}
#tm-project .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:0 0 8px}
#tm-project .summary{background:var(--card2);border-left:4px solid var(--gold);font-size:16px;line-height:1.45;margin-bottom:14px}
#tm-project .summary .muted{margin:4px 0 0}
#tm-project .chip{display:inline-block;flex:none;padding:0 9px;border-radius:999px;font-size:12px;font-weight:800;
  line-height:20px;white-space:nowrap;background:var(--line2);color:var(--text);vertical-align:middle}
#tm-project .chip.ver{background:#4a3a2a;color:var(--gold)}
#tm-project .chip.s-done,#tm-project .chip.k-check,#tm-project .chip.a-merge{background:var(--ok);color:#13200f}
#tm-project .chip.s-review,#tm-project .chip.k-feedback,#tm-project .chip.a-screenshots{background:var(--review);color:#0d1824}
#tm-project .chip.s-running,#tm-project .chip.a-tests{background:var(--run);color:#2a1a00}
#tm-project .chip.s-blocked{background:var(--block);color:#2a0d08}
#tm-project .chip.s-next{background:none;border:1px solid var(--muted);line-height:18px}
#tm-project .chip.s-later{background:none;border:1px dashed var(--later);color:var(--muted);line-height:18px}
#tm-project .chip.k-decision,#tm-project .chip.a-decision,#tm-project .chip.a-request{background:var(--gold);color:#2a1a00}
#tm-project .chip.k-question{background:#c39be6;color:#1e0f2b}
#tm-project .needs{border:2px solid var(--gold);border-radius:14px;background:#3a2a14;padding:10px 12px 4px}
#tm-project .need{background:var(--card);border:1px solid #8a6a2e;border-radius:10px;padding:10px 12px;margin:0 0 8px}
#tm-project .need.closed{border-color:var(--line);opacity:.92}
#tm-project .nhead{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px}
#tm-project .nhead .chip{margin-top:1px}
#tm-project ol.opts{margin:2px 0 6px;padding-left:26px;list-style:upper-alpha}
#tm-project ol.opts li{padding:1px 0}
#tm-project .answer{color:var(--ok);font-weight:700}
#tm-project .jline{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
#tm-project .jline .t{flex:1 1 160px;min-width:0;font-weight:700}
#tm-project .when{color:var(--muted);font-size:13px}
#tm-project .job .when{margin-top:2px;color:var(--text)}
#tm-project .job.s-blocked{border-color:var(--block)}
#tm-project .prog{display:flex;align-items:center;gap:10px;margin:8px 0 2px}
#tm-project .bar{flex:1;max-width:340px;height:10px;border-radius:5px;background:var(--line2);overflow:hidden}
#tm-project .bar>i{display:block;height:100%;border-radius:5px;background:var(--ok)}
#tm-project .pn{font-size:13px;font-weight:700;white-space:nowrap}
#tm-project .links{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
#tm-project a.lnk{display:inline-flex;align-items:center;min-height:44px;padding:2px 12px;border-radius:8px;
  border:1px solid var(--btnline);background:var(--btn);color:var(--gold);font-weight:700;text-decoration:none;
  touch-action:manipulation;overflow-wrap:anywhere}
#tm-project a.lnk:hover{border-color:var(--gold)}
#tm-project details.fold{margin:6px 0}
#tm-project details.fold>summary{display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 2px;cursor:pointer;
  color:var(--gold);font-weight:700;list-style:none;touch-action:manipulation}
#tm-project details.fold>summary::-webkit-details-marker{display:none}
#tm-project details.fold>summary::before{content:'▸';color:var(--muted);transition:transform .15s}
#tm-project details.fold[open]>summary::before{transform:rotate(90deg)}
#tm-project ul.check{list-style:none;margin:4px 0 6px;padding:0}
#tm-project ul.check li{display:flex;align-items:flex-start;gap:8px;padding:3px 0}
#tm-project ul.check .box{flex:none;display:grid;place-items:center;width:20px;height:20px;margin-top:1px;border-radius:5px;
  border:2px solid var(--btnline);font-size:13px;font-weight:800}
#tm-project ul.check li.on .box{background:var(--ok);border-color:var(--ok);color:#13200f}
#tm-project ul.check li.on .txt{color:var(--muted)}
#tm-project ul.check .txt{flex:1;min-width:0}
#tm-project ul.check .at{color:var(--muted);font-size:12px;white-space:nowrap}
#tm-project .tick{flex:none;display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;
  border:2px solid var(--btnline);font-size:13px;font-weight:800}
#tm-project .tick.on{background:var(--ok);border-color:var(--ok);color:#13200f}
#tm-project .tick.active{border-color:var(--run);background:radial-gradient(circle,var(--run) 0 4px,transparent 5px)}
#tm-project .card.list{padding:4px 12px}
#tm-project .jl{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--line2)}
#tm-project .jl:last-child{border-bottom:0}
#tm-project .jl .tick{margin-top:1px}
#tm-project .jlb{flex:1;min-width:0}
#tm-project .nums{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
#tm-project .num{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
#tm-project .num .v{font-size:22px;font-weight:800;line-height:1.1;color:var(--gold)}
#tm-project .num .l{font-size:13px;line-height:1.25}
#tm-project .num .n{font-size:12px;color:var(--muted);line-height:1.25}
#tm-project ul.acts-list{list-style:none;margin:0;padding:0}
#tm-project .act{padding:8px 0;border-bottom:1px solid var(--line2)}
#tm-project .act:last-child{border-bottom:0}
#tm-project .ahead{display:flex;align-items:center;gap:8px;margin-bottom:2px}
#tm-project .ahead .at{color:var(--muted);font-size:13px;font-weight:700;white-space:nowrap}
#tm-project .ov{display:flex;flex-direction:column}
#tm-project .ov .col{display:contents}
#tm-project .ov .o1{order:1}#tm-project .ov .o2{order:2}#tm-project .ov .o3{order:3}#tm-project .ov .o4{order:4}
#tm-project .ov .o5{order:5}#tm-project .ov .o6{order:6}#tm-project .ov .o7{order:7}
@media (min-width:960px){#tm-project .ov{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:0 20px;align-items:start}
  #tm-project .ov .col{display:block}}
#tm-project .rgroup h2{border-bottom:1px solid var(--line);padding-bottom:4px}
#tm-project .jrow{border-bottom:1px solid var(--line2)}
#tm-project .jhead{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px}
#tm-project .jt{flex:1 1 300px;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-height:48px;
  padding:6px 4px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;touch-action:manipulation}
#tm-project .jt:hover{background:rgba(255,255,255,.03)}
#tm-project .jt .l1{flex:1 1 320px;min-width:0;display:flex;align-items:center;gap:10px}
#tm-project .jt .l2{flex:0 1 auto;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
#tm-project .jt .arrow{flex:none;width:12px;color:var(--muted);transition:transform .15s}
#tm-project .jt[aria-expanded=true] .arrow{transform:rotate(90deg)}
#tm-project .jt .t{flex:1;min-width:0;font-weight:700}
#tm-project .jrow.s-done .jt .t{color:var(--muted)}
#tm-project .jhead a.lnk{padding:2px 10px}
#tm-project .jmore{padding:2px 6px 14px 38px}
#tm-project .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin:8px 0 4px}
#tm-project .gallery.small{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
#tm-project .strip{display:flex;gap:10px;overflow-x:auto;touch-action:pan-x pan-y;padding-bottom:6px;-webkit-overflow-scrolling:touch}
#tm-project .strip .fig{flex:none;width:250px}
#tm-project .fig{margin:0;min-width:0}
#tm-project .thb{display:block;width:100%;aspect-ratio:16/9;padding:0;border:1px solid var(--line);border-radius:8px;
  overflow:hidden;background:#120d0a;cursor:zoom-in;touch-action:manipulation}
#tm-project .thb:hover{border-color:var(--gold)}
#tm-project .ph{display:block;width:100%;height:100%}
#tm-project .thb img{display:block;width:100%;height:100%;object-fit:cover}
#tm-project figcaption{margin-top:4px;color:var(--muted);font-size:12.5px;line-height:1.3}
#tm-project .broken{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:8px;
  border:1px dashed var(--btnline);border-radius:8px;background:var(--card);color:var(--muted);font-size:12.5px;
  line-height:1.3;text-align:center;overflow:hidden}
#tm-project .fig.is-broken figcaption{display:none}
#tm-project ul.bul{margin:4px 0 6px;padding-left:20px}
#tm-project ul.bul li{margin:2px 0}
#tm-project dl.defs{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px;margin:4px 0 8px}
#tm-project dl.defs dt{font-weight:700;color:var(--gold)}
#tm-project dl.defs dd{margin:0}
#tm-project blockquote{margin:4px 0;padding-left:10px;border-left:3px solid var(--btnline);font-size:15.5px}
#tm-project .outcome{display:flex;gap:6px;margin:4px 0}
#tm-project .outcome .arrow{color:var(--gold);font-weight:800}
#tm-project .jref{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:6px}
#tm-project .jref .t{font-weight:700}
#tm-project .alert{border:2px solid var(--block);background:#3a1a14;border-radius:12px;padding:10px 12px;margin:0 0 14px}
#tm-project .alert strong{display:block;font-size:16px}
#tm-project .alert code{display:block;margin:4px 0;font:12px/1.35 ui-monospace,monospace;color:var(--muted);
  overflow-wrap:anywhere;-webkit-user-select:text;user-select:text}
#tm-project .alert .row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:6px}
#tm-project .offline{color:var(--gold);font-weight:700}
#tm-project .loading{display:flex;align-items:center;justify-content:center;gap:10px;min-height:40vh;color:var(--muted);font-size:16px}
#tm-project .spin{width:18px;height:18px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--gold);
  animation:tm-project-spin .9s linear infinite}
@keyframes tm-project-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){#tm-project .spin{animation-duration:3s}}
#tm-project .lb{position:fixed;inset:0;z-index:2;display:flex;flex-direction:column;background:#0d0907;
  touch-action:none;overscroll-behavior:contain;padding:env(safe-area-inset-top) env(safe-area-inset-right)
  env(safe-area-inset-bottom) env(safe-area-inset-left)}
#tm-project .lbbar{flex:none;display:flex;align-items:center;gap:8px;padding:6px 10px}
#tm-project .lbbar .count{flex:1;color:var(--muted);font-size:14px;font-weight:700}
#tm-project .lbstage{flex:1;min-height:0;display:flex;align-items:center;gap:6px;padding:0 6px}
#tm-project .lbstage .nav{flex:none;width:52px;height:72px;font-size:30px;line-height:1}
#tm-project .pic{flex:1;min-width:0;height:100%;display:flex;align-items:center;justify-content:center}
#tm-project .pic .ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%}
#tm-project .pic img{display:block;max-width:100%;max-height:100%;object-fit:contain;border-radius:4px}
#tm-project .pic .broken{max-width:520px;height:auto;min-height:120px;font-size:15px}
#tm-project .lb .cap{flex:none;padding:6px 16px 10px;text-align:center;font-size:14.5px;line-height:1.35}
@media (max-width:640px){
  #tm-project .acts .long{display:none}#tm-project .acts .short{display:inline}
  #tm-project .meta .sep{display:none}#tm-project .meta .bld{display:block}
  #tm-project .jt .l2{padding-left:48px}
  #tm-project h1{font-size:19px}
  #tm-project .wrap{padding:10px 12px 24px}
  #tm-project .jmore{padding-left:8px}
  #tm-project .lbstage .nav{width:44px}
}
@media (max-height:500px){
  #tm-project{font-size:14px}
  #tm-project .top{grid-template-areas:"ttl ttl" "tabs acts";padding:3px 10px 0;column-gap:8px}
  #tm-project .ttl{display:flex;align-items:baseline;gap:10px;white-space:nowrap;overflow:hidden}
  #tm-project h1{flex:none;font-size:15px}
  #tm-project .meta{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px}
  #tm-project .tabs{margin-top:0}
  #tm-project .tab{padding:2px 10px}
  #tm-project .acts .long{display:none}#tm-project .acts .short{display:inline}
  #tm-project .acts .btn{padding:2px 10px}
  #tm-project .wrap{padding:8px 12px 20px}
  #tm-project h2{font-size:16px}
  #tm-project .summary{font-size:15px}
  #tm-project .lbbar{padding:2px 8px}
  #tm-project .lb .cap{padding:2px 12px 6px;font-size:13px}
  #tm-project .lbstage .nav{height:56px}
}
`;
