/* WortWeg — 学習モード、正誤判定、単語帳、暗記済み管理を担当します。 */

(()=>{
'use strict';
const POS={noun:'名詞',verb:'動詞',adj:'形容詞',adv:'副詞',prep:'前置詞',conj:'接続詞',expr:'表現・その他'};
const STORE='wortweg:v1:';
const $=(id)=>document.getElementById(id);
function load(key,fallback){try{const x=JSON.parse(localStorage.getItem(STORE+key));return x??fallback}catch{return fallback}}
function save(key,obj){try{localStorage.setItem(STORE+key,JSON.stringify(obj));return true}catch{toast('ブラウザに保存できませんでした。保存容量やプライベートモードを確認してください。');return false}}
function normalize(w){return String(w||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('de-DE')}
function makeId(w,scope){return scope+'|'+w.level+'|'+w.pos+'|'+normalize(w.de)}
function esc(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function validWord(w){return !!(w&&['A1','A2','B1'].includes(w.level)&&Object.hasOwn(POS,w.pos)&&typeof w.de==='string'&&w.de.trim()&&w.de.length<=140&&typeof w.ja==='string'&&w.ja.trim()&&w.ja.length<=250)}
const base=window.WORTWEG_WORDS.filter(validWord).map(w=>({...w,id:makeId(w,'base')}));
let custom=(load('custom',[]));if(!Array.isArray(custom))custom=[];custom=custom.filter(validWord).map(w=>({de:w.de.trim(),ja:w.ja.trim(),pos:w.pos,level:w.level,id:makeId(w,'custom')}));
let masteredList=load('mastered',[]);const mastered=new Set(Array.isArray(masteredList)?masteredList:[]);
let mode='both', session=null, libraryLimit=40, libraryFiltered=[], previousPos='all';
function words(){const keys=new Set(base.map(w=>w.level+'|'+w.pos+'|'+normalize(w.de)));return [...base,...custom.filter(w=>!keys.has(w.level+'|'+w.pos+'|'+normalize(w.de)))];}
function known(w){return mastered.has(w.id)}
function toggleKnown(w){if(known(w))mastered.delete(w.id);else mastered.add(w.id);save('mastered',[...mastered]);updateStats();updateEligible()}
function updateStats(){const arr=words(),n=arr.filter(known).length;$('totalStat').textContent=arr.length;$('knownStat').textContent=n;$('leftStat').textContent=arr.length-n}
function nounParts(w){
  if(w.pos!=='noun')return null;
  const match=/^\s*(der|die|das)\s+(.+?)\s*$/i.exec(w.de);
  return match?{article:match[1].toLocaleLowerCase('de-DE'),word:match[2]}:null;
}
function upperFirstNoun(value){
  return String(value).replace(/^(\s*)([\p{L}])/u,(all,spaces,letter)=>spaces+letter.toLocaleUpperCase('de-DE'));
}
function setNounCapitalization(input){
  const original=input.value;
  const capitalized=upperFirstNoun(original);
  if(original!==capitalized){
    const a=input.selectionStart,b=input.selectionEnd;
    input.value=capitalized;
    // The only length change normally occurs with a capital ß → SS.
    const delta=capitalized.length-original.length;
    input.setSelectionRange(Math.min(capitalized.length,a+delta),Math.min(capitalized.length,b+delta));
  }
}
function filterEligible(){
  const levels=[...document.querySelectorAll('input[name="level"]:checked')].map(x=>x.value);
  const pos=$('posSelect').value;
  const ex=$('excludeKnown').checked;
  return words().filter(w=>levels.includes(w.level)
    &&(mode==='gender'?w.pos==='noun':(pos==='all'||w.pos===pos))
    &&(mode!=='gender'&&mode!=='type'||w.pos!=='noun'||nounParts(w))
    &&(mode!=='gender'||nounParts(w))
    &&(!ex||!known(w)));
}
function updateEligible(){const length=filterEligible().length;$('eligibleText').textContent=length+'語が対象';$('startBtn').disabled=length===0;$('startBtn').title=length?'':'対象の単語がありません';}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3200)}
function setTab(tab){for(const el of document.querySelectorAll('.view'))el.classList.toggle('active',el.id===tab+'View');for(const el of document.querySelectorAll('.navbtn')){el.classList.toggle('active',el.dataset.tab===tab);el.setAttribute('aria-current',el.dataset.tab===tab?'page':'false')}if(tab==='library')renderLibrary(true);updateStats();if(tab!=='study')window.scrollTo({top:0,behavior:'smooth'})}
function setMode(next){
  const pos=$('posSelect');
  if(next==='gender'&&mode!=='gender'){
    previousPos=pos.value;
    pos.value='noun';
    pos.disabled=true;
  }else if(next!=='gender'&&mode==='gender'){
    pos.disabled=false;
    pos.value=previousPos;
  }
  mode=next;
  for(const el of document.querySelectorAll('.mode-btn')){
    const active=el.dataset.mode===mode;
    el.classList.toggle('active',active);
    el.setAttribute('aria-pressed',String(active));
  }
  updateEligible();
}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function start(){
  const chosen=filterEligible();
  if(!chosen.length){toast('対象の単語がありません。条件を変更してください。');return;}
  const count=Math.min(chosen.length,Math.max(1,parseInt($('qtyInput').value,10)||20));
  session={deck:shuffle(chosen).slice(0,count),index:0,mode,articleChoice:'',revealed:false,checked:null,manualOverride:false,
    feedback:null,typed:'',hint:false,seen:new Set(),correct:new Set(),marked:new Set()};
  renderCard();
  if(matchMedia('(max-width:730px)').matches){$('practicePanel').scrollIntoView({behavior:'smooth',block:'start'});}
}
function renderCard(){
  const root=$('practiceContent');
  if(!session)return;
  const s=session;
  if(s.index>=s.deck.length){
    root.innerHTML=`<div class="finished"><div class="finish-icon">✓</div><h2>学習完了！</h2><p>${s.deck.length}語の学習を終えました。今回暗記済みにした単語は <b>${s.marked.size}語</b> です。</p>${['type','gender'].includes(s.mode)?`<p>自動採点の正解数：<b>${s.correct.size}語</b></p>`:''}<button class="btn btn-primary" id="restartBtn" type="button">別の単語で練習する →</button><button class="small-link" type="button" id="backSetup" style="margin-top:18px">設定に戻る</button></div>`;
    $('restartBtn').onclick=start;
    $('backSetup').onclick=()=>{session=null;renderIdle();};
    return;
  }
  const w=s.deck[s.index];
  const isType=s.mode==='type', isGender=s.mode==='gender';
  const noun=isType&&w.pos==='noun';
  const parts=nounParts(w);
  let cardBody='';
  if(isGender){
    cardBody=`<div class="card-label">名詞の性を選ぼう</div><div class="deutsch">${esc(parts.word)}</div><div class="japanese">${esc(w.ja)}</div>${s.revealed?`<div class="article-answer">正解：<b>${esc(parts.article)} ${esc(parts.word)}</b></div>`:''}`;
  }else{
    const showDe=s.mode==='both'||s.mode==='de'||((s.mode==='ja'||isType)&&s.revealed);
    const showJa=s.mode==='both'||s.mode==='ja'||isType||(s.mode==='de'&&s.revealed);
    const german=`<div class="card-label">DEUTSCH</div>${showDe?`<div class="deutsch">${esc(w.de)}</div>`:'<div class="hidden-answer">答えはまだ表示されていません</div>'}`;
    const japanese=`<div class="card-label">日本語</div>${showJa?`<div class="japanese">${esc(w.ja)}</div>`:'<div class="hidden-answer">意味を思い出してみよう</div>'}`;
    cardBody=s.mode==='de'?german+'<div class="card-divider"></div>'+japanese:(s.mode==='ja'||isType?japanese+(showDe?'<div class="card-divider"></div>'+german:''):german+'<div class="card-divider"></div>'+japanese);
  }
  const choices=(noun||isGender)?`<div class="article-question"><div class="answer-step">${isType?'① 名詞の性を選択':'正しい冠詞を選択'}</div><div class="article-options" role="group" aria-label="冠詞を選ぶ">${['der','die','das'].map((a,i)=>{
    const selected=s.articleChoice===a;
    const state=s.revealed&&parts?.article===a?' correct-choice':s.revealed&&selected?' wrong-choice':'';
    return `<button type="button" class="article-option ${selected?'selected':''}${state}" data-article="${a}" aria-pressed="${selected}" ${s.revealed?'disabled':''}><strong>${a}</strong><span>${['男性','女性','中性'][i]}</span></button>`;
  }).join('')}</div></div>`:'';
  const writing=isType?`${choices}<label class="answer-step" for="answerInput">${noun?'② 名詞の綴り（冠詞は入力しない）':'ドイツ語の綴りを入力'}</label><div class="answer-inputrow"><input id="answerInput" type="text" lang="de" autocomplete="off" autocorrect="off" autocapitalize="${noun?'sentences':'off'}" spellcheck="false" placeholder="${noun?'例：Hund（der は不要）':'ドイツ語を入力'}" aria-label="ドイツ語の解答を入力" value="${esc(s.typed)}" ${s.revealed?'disabled':''}><button class="btn btn-primary" id="checkBtn" type="button" ${s.revealed?'disabled':''}>答え合わせ</button></div><div class="special-keys" aria-label="特殊文字の入力">${['ä','ö','ü','ß','Ä','Ö','Ü'].map(char=>`<button type="button" class="special-key" data-char="${char}" ${s.revealed?'disabled':''}>${char}</button>`).join('')}<button class="small-link" id="inlineHelp" type="button">入力方法 ?</button></div>`:'';
  const result=s.checked?`<div class="result ${s.checked==='good'?'good':'bad'}" role="status"><div class="result-heading"><span class="result-mark" aria-hidden="true">${s.checked==='good'?'✓':'×'}</span><div><span class="result-overline">ANSWER CHECK / ${s.checked==='good'?'CORRECT':'INCORRECT'}</span><div class="result-title">${s.manualOverride?'自己採点で正解扱い':s.checked==='good'?'正解':'不正解'}</div></div></div>${s.checked==='bad'?'<div class="result-caption">正解を確認して、次の単語に進みましょう。</div>':''}${s.mode==='type'&&s.feedback?`<div class="result-detail"><span class="grade-chip ${s.feedback.spelling?'good':'bad'}">${s.feedback.spelling?'✓':'×'} 綴り：${s.feedback.spelling?'正解':'不正解'}</span>${noun?`<span class="grade-chip ${s.feedback.gender?'good':'bad'}">${s.feedback.gender?'✓':'×'} 冠詞：${s.feedback.gender?'正解':'不正解'}</span>`:''}</div>`:''}${s.checked==='bad'?'<button class="small-link" id="selfRight" type="button">正解扱いにする</button>':''}</div>`:'';
  root.innerHTML=`<div class="practice-top"><span class="session-count">SESSION ${String(s.index+1).padStart(2,'0')} / ${String(s.deck.length).padStart(2,'0')}</span><span class="session-tag">${w.level} ・ ${POS[w.pos]}</span></div><div class="progress"><span style="width:${(s.index/s.deck.length)*100}%"></span></div>
  <div class="flashcard">${known(w)?'<span class="known-chip">✓ 暗記済み</span>':''}${cardBody}</div>
  ${isGender?choices:writing}
  ${result}
  ${s.hint&&!s.revealed?`<p class="hintline">ヒント：${esc(firstHint(w.de))}</p>`:''}
  <div class="practice-controls">${!s.revealed&&s.mode!=='both'?`<button id="revealBtn" class="btn btn-secondary" type="button">答えを見る</button>`:''}${isType&&!s.revealed?'<button id="hintBtn" class="btn btn-ghost" type="button">ヒント</button>':''}<button id="masterBtn" class="btn ${known(w)?'btn-secondary':'btn-accent'}" type="button">${known(w)?'✓ 暗記済みを解除':'✓ 覚えた'}</button></div>
  <div class="practice-controls"><button class="btn btn-ghost" id="prevBtn" ${s.index===0?'disabled':''} type="button">← 前へ</button><button class="btn btn-primary" id="nextBtn" type="button">${s.index===s.deck.length-1?'学習を終了':'次の単語 →'}</button></div>
  <div class="footnote">${isGender?'名詞の綴りを見て、der / die / das から正しい冠詞を選んでください。':isType?(noun?'冠詞は三択、入力欄には名詞の綴りだけ。先頭は自動で大文字になります。':'入力は大文字・小文字を区別しません。'):'「覚えた」を押した単語は次回以降の出題対象から除外できます。'}</div>`;
  const input=$('answerInput');
  if(input){
    let composing=false;
    input.addEventListener('compositionstart',()=>{composing=true});
    input.addEventListener('compositionend',()=>{composing=false;if(noun)setNounCapitalization(input);s.typed=input.value});
    input.addEventListener('input',e=>{if(noun&&!composing&&!e.isComposing)setNounCapitalization(input);s.typed=input.value});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();if(s.revealed)next();else checkAnswer();}});
    root.querySelectorAll('[data-char]').forEach(b=>b.onclick=()=>{
      if(input.disabled)return;
      const char=b.dataset.char;
      const left=input.selectionStart??input.value.length, right=input.selectionEnd??left;
      input.setRangeText(char,left,right,'end');
      if(noun)setNounCapitalization(input);
      s.typed=input.value;
      input.focus();
    });
    $('inlineHelp').onclick=()=>setTab('help');
  }
  root.querySelectorAll('[data-article]').forEach(b=>b.onclick=()=>{
    if(s.revealed)return;
    s.articleChoice=b.dataset.article;
    if(isGender){gradeGender();return;}
    for(const other of root.querySelectorAll('[data-article]')){
      other.classList.toggle('selected',other.dataset.article===s.articleChoice);
      other.setAttribute('aria-pressed',String(other.dataset.article===s.articleChoice));
    }
  });
  if($('checkBtn'))$('checkBtn').onclick=checkAnswer;
  if($('revealBtn'))$('revealBtn').onclick=()=>{s.revealed=true;renderCard();};
  if($('hintBtn'))$('hintBtn').onclick=()=>{s.hint=true;renderCard();$('answerInput')?.focus();};
  if($('selfRight'))$('selfRight').onclick=()=>{s.checked='good';s.feedback=null;s.manualOverride=true;renderCard();};
  $('masterBtn').onclick=()=>{toggleKnown(w);if(known(w))s.marked.add(w.id);else s.marked.delete(w.id);renderCard();};
  $('prevBtn').onclick=()=>{if(s.index>0){s.index--;resetQuestion(s);renderCard();}};
  $('nextBtn').onclick=next;
}
function resetQuestion(s){s.revealed=false;s.checked=null;s.feedback=null;s.manualOverride=false;s.typed='';s.hint=false;s.articleChoice='';}
function gradeGender(){
  const s=session;
  if(!s||s.mode!=='gender'||s.revealed)return;
  const w=s.deck[s.index],parts=nounParts(w);
  if(!parts)return;
  s.checked=s.articleChoice===parts.article?'good':'bad';
  if(s.checked==='good')s.correct.add(w.id);
  s.revealed=true;
  renderCard();
}
function firstHint(de){const v=de.replace(/^(der|die|das)\s+/i,'');return (v.charAt(0)||'?')+'…'}
function checkAnswer(){
  const s=session;
  if(!s||s.mode!=='type'||s.revealed)return;
  const w=s.deck[s.index],parts=nounParts(w);
  const spelling=normalize(s.typed);
  if(!spelling){toast('ドイツ語の綴りを入力してください。');return;}
  if(parts&&!s.articleChoice){toast('名詞の性（der / die / das）を選んでください。');return;}
  if(parts&&/^(der|die|das)\s+/i.test(s.typed.trim())){toast('入力欄には冠詞を含めず、名詞だけ入力してください。');return;}
  s.feedback={spelling:spelling===normalize(parts?parts.word:w.de),gender:!parts||s.articleChoice===parts.article};
  s.checked=s.feedback.spelling&&s.feedback.gender?'good':'bad';
  if(s.checked==='good')s.correct.add(w.id);
  s.revealed=true;
  renderCard();
}
function next(){const s=session;if(!s)return;s.seen.add(s.deck[s.index].id);s.index++;resetQuestion(s);renderCard();}
function renderIdle(){$('practiceContent').innerHTML='<div class="idle"><div class="idle-top"><span class="pill"><span class="dot"></span> READY TO LEARN</span><span class="idle-number">DEUTSCH / JAPANESE</span></div><div class="idle-art"><span class="idle-small">WORTWEG — DAILY PRACTICE</span><div class="idle-german">Wort für Wort.</div><div class="idle-japanese">一語ずつ、着実に。</div></div><div class="idle-bottom"><div><h3>今日の学習を始める</h3><p>左側でレベルとモードを選び、学習を開始してください。</p></div><span class="arrow-mark">↗</span></div></div>'}
function renderLibrary(reset=false){if(reset)libraryLimit=40;const term=normalize($('librarySearch').value),level=$('libraryLevel').value,pos=$('libraryPos').value,status=$('libraryStatus').value;libraryFiltered=words().filter(w=>(level==='all'||w.level===level)&&(pos==='all'||w.pos===pos)&&(status==='all'||(status==='known'&&known(w))||(status==='unknown'&&!known(w)))&&(!term||normalize(w.de).includes(term)||normalize(w.ja).includes(term)));$('libraryCount').textContent=`${libraryFiltered.length}語が見つかりました（${Math.min(libraryLimit,libraryFiltered.length)}語を表示）`;
const shown=libraryFiltered.slice(0,libraryLimit);$('wordList').innerHTML=shown.length?shown.map(w=>`<div class="word-row"><div class="word-info"><div class="word-de">${esc(w.de)}</div><div class="word-ja">${esc(w.ja)}</div><div class="word-sub">${esc(w.level)} · ${POS[w.pos]} ${w.id.startsWith('custom|')?'· 追加単語':''}</div></div><button class="mark-btn ${known(w)?'marked':''}" data-word="${esc(w.id)}" type="button" aria-label="${esc(w.de)}の暗記マークを切り替え" title="暗記済みを切り替え">${known(w)?'✓':'○'}</button></div>`).join(''):'<div class="empty" style="grid-column:1/-1">該当する単語がありません。フィルターを変更してください。</div>';$('loadMore').style.display=libraryFiltered.length>libraryLimit?'inline-flex':'none'}
function parseCSV(text){text=text.replace(/^\uFEFF/,'');const firstLine=(text.split(/\r?\n/)[0]||'');const delimiter=(firstLine.match(/\t/g)||[]).length>(firstLine.match(/,/g)||[]).length?'\t':',';let rows=[],row=[],field='',quotes=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quotes&&text[i+1]==='"'){field+='"';i++}else quotes=!quotes}else if(!quotes&&ch===delimiter){row.push(field);field=''}else if(!quotes&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field=''}else field+=ch}row.push(field);if(row.some(v=>v.trim()))rows.push(row);if(quotes)throw Error('CSVの引用符が閉じられていません');return rows}
const POS_MAP={'名詞':'noun','動詞':'verb','形容詞':'adj','副詞':'adv','前置詞':'prep','接続詞':'conj','表現':'expr','その他':'expr','adjective':'adj','adverb':'adv','preposition':'prep','conjunction':'conj','expression':'expr'};
function standardizedPOS(p){let x=String(p||'').trim().toLowerCase();return Object.hasOwn(POS,x)?x:(POS_MAP[x]||'')}
function addWords(imported){const exists=new Set(words().map(w=>w.level+'|'+w.pos+'|'+normalize(w.de)));let added=0,skipped=0;for(const row of imported){let w={de:String(row.de||'').trim(),ja:String(row.ja||'').trim(),level:String(row.level||'').trim().toUpperCase(),pos:standardizedPOS(row.pos)};if(!validWord(w)){skipped++;continue}const id=w.level+'|'+w.pos+'|'+normalize(w.de);if(exists.has(id)){skipped++;continue}exists.add(id);custom.push({...w,id:makeId(w,'custom')});added++}if(added)save('custom',custom);updateStats();updateEligible();return {added,skipped}}
async function importCSV(file){try{if(file.size>5e6)throw Error('5MB以下のファイルを選んでください');const txt=await file.text(),rows=parseCSV(txt);if(!rows.length)throw Error('内容が空です');const headers=rows[0].map(x=>x.trim().toLowerCase());const aliases={de:['de','deutsch','german','ドイツ語'],ja:['ja','japanese','日本語','意味'],level:['level','cefr','レベル'],pos:['pos','part of speech','品詞']};const inds=Object.fromEntries(Object.entries(aliases).map(([key,choices])=>[key,headers.findIndex(h=>choices.includes(h))]));if(Object.values(inds).some(x=>x<0))throw Error('先頭行に de, ja, level, pos の列名が必要です');const items=rows.slice(1).map(r=>Object.fromEntries(Object.entries(inds).map(([key,i])=>[key,r[i]||''])));const {added,skipped}=addWords(items);toast(`${added}語を追加、${skipped}行をスキップしました`)}catch(err){toast('取り込み失敗：'+err.message)}finally{$('csvFile').value=''}}
function download(name,contents,mime){const blob=new Blob([contents],{type:mime}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2500)}
function backup(){const data={app:'WortWeg',version:1,exportedAt:new Date().toISOString(),custom:custom.map(({de,ja,level,pos})=>({de,ja,level,pos})),mastered:[...mastered]};download('wortweg-backup.json',JSON.stringify(data,null,2),'application/json;charset=utf-8');toast('バックアップを保存しました')}
async function restore(file){try{if(file.size>5e6)throw Error('ファイルが大きすぎます');const data=JSON.parse(await file.text());if(data.app!=='WortWeg'||data.version!==1||!Array.isArray(data.custom)||!Array.isArray(data.mastered))throw Error('WortWegのバックアップではありません');if(!confirm('現在の暗記済み情報と追加単語をバックアップの内容で置き換えます。続行しますか？'))return;
custom=[];mastered.clear();addWords(data.custom);for(const id of data.mastered){if(typeof id==='string'&&id.length<400)mastered.add(id)}save('custom',custom);save('mastered',[...mastered]);updateStats();updateEligible();toast('バックアップを復元しました')}catch(err){toast('復元できませんでした：'+err.message)}finally{$('backupFile').value=''}}
function init(){document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));document.querySelector('.brand').onclick=e=>{e.preventDefault();setTab('study')};document.querySelectorAll('.mode-btn').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelectorAll('input[name="level"],#posSelect,#excludeKnown').forEach(el=>el.addEventListener('change',updateEligible));$('startBtn').onclick=start;
$('helpQuickLink').onclick=()=>setTab('help');$('helpBackBtn').onclick=()=>setTab('study');
['librarySearch','libraryLevel','libraryPos','libraryStatus'].forEach(id=>$(id).addEventListener(id==='librarySearch'?'input':'change',()=>renderLibrary(true)));
$('showUnknown').onclick=()=>{$('libraryStatus').value='unknown';renderLibrary(true)};$('loadMore').onclick=()=>{libraryLimit+=40;renderLibrary()};$('wordList').onclick=e=>{const b=e.target.closest('[data-word]');if(!b)return;const w=words().find(x=>x.id===b.dataset.word);if(w){toggleKnown(w);renderLibrary()}};
$('addWordForm').onsubmit=e=>{e.preventDefault();const {added,skipped}=addWords([{de:$('newDe').value,ja:$('newJa').value,level:$('newLevel').value,pos:$('newPos').value}]);if(added){$('addWordForm').reset();$('newLevel').value='A2';toast('単語を追加しました')}else toast(skipped?'この単語は登録済みか、入力内容に問題があります':'単語を追加できませんでした')};
$('csvFile').onchange=e=>{if(e.target.files[0])importCSV(e.target.files[0])};$('backupFile').onchange=e=>{if(e.target.files[0])restore(e.target.files[0])};
$('sampleCsv').onclick=()=>download('wortweg-template.csv','\uFEFFde,ja,level,pos\r\nder Hund,犬,A1,noun\r\nlernen,学ぶ,A1,verb\r\nzuverlässig,信頼できる,B1,adj\r\n','text/csv;charset=utf-8');
$('exportBackup').onclick=backup;
$('resetKnown').onclick=()=>{if(!mastered.size){toast('暗記済みの単語はありません');return}if(!confirm('すべての暗記済みマークを解除しますか？'))return;mastered.clear();save('mastered',[]);updateStats();updateEligible();toast('暗記済みマークをリセットしました')};
$('clearCustom').onclick=()=>{if(!custom.length){toast('追加単語はありません');return}if(!confirm(`${custom.length}語の追加単語を削除しますか？`))return;for(const w of custom)mastered.delete(w.id);custom=[];save('custom',[]);save('mastered',[...mastered]);updateStats();updateEligible();toast('追加単語を削除しました')};
updateStats();updateEligible();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
}
init();
})();
